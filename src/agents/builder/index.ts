import { t } from '../../i18n/index.js';
import { BaseAgent } from '../../core/agent.js';
import { logger } from '../../utils/logger.js';
import {
  ensureDir,
  writeFile,
  writeJson,
  cleanDir,
  readFile,
  fileExists,
} from '../../utils/fs-helpers.js';
import type {
  IdeaArtifact,
  DesignArtifact,
  BuildArtifact,
  BuilderSpec,
} from '../../types/artifacts.js';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { EventBus } from '../../observability/event-bus.js';
import * as path from 'path';
import * as fs from 'fs/promises';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface BuilderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  outputDir: string;
  eventBus?: EventBus;
  language?: string;
}

interface BuilderResult {
  type: string;
  label: string;
  fileCount: number;
  status: 'success' | 'failure';
  error?: string;
}

// ----------------------------------------------------------------
// DynamicBuilderAgent
// ----------------------------------------------------------------

export class DynamicBuilderAgent extends BaseAgent {
  private builderCfg: BuilderConfig;
  private bus?: EventBus;
  private language: string;

  constructor(config: BuilderConfig) {
    super({
      name: 'DynamicBuilderAgent',
      systemPrompt:
        'You are a code generation agent. Given a design specification, you generate complete, production-ready code files.',
      model: config.model,
      maxTokens: 16384,
      temperature: 0.3,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
    this.builderCfg = config;
    this.bus = config.eventBus;
    this.language = config.language || 'en';
  }

  // Chat with automatic retry when the proxy returns a streaming warning
  private async chatWithRetry(
    messages: MessageParam[],
    maxTokens: number,
    maxRetries = 2
  ): Promise<string> {
    let lastError = '';
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.chat(messages, maxTokens);
        // Detect proxy streaming warning in the response
        if (response.includes('Streaming is strongly recommended')) {
          logger.warn(
            `BUILDER:${this.name}`,
            t('build.streamingRetry', { attempt: attempt + 1, max: maxRetries + 1 })
          );
          lastError = 'Proxy streaming warning';
          // Reduce token budget on retry
          maxTokens = Math.max(2048, Math.floor(maxTokens / 2));
          continue;
        }
        return response;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
        logger.warn(
          `BUILDER:${this.name}`,
          t('build.attemptFailed', { attempt: attempt + 1, max: maxRetries + 1, error: lastError })
        );
        if (attempt < maxRetries) {
          maxTokens = Math.max(2048, Math.floor(maxTokens / 2));
        }
      }
    }
    throw new Error(lastError);
  }

  // ----------------------------------------------------------------
  // Main entry point
  // ----------------------------------------------------------------

  async run(input: { idea: IdeaArtifact; design: DesignArtifact }): Promise<BuildArtifact>;
  async run(idea: IdeaArtifact, design: DesignArtifact): Promise<BuildArtifact>;
  async run(
    ideaOrInput: IdeaArtifact | { idea: IdeaArtifact; design: DesignArtifact },
    d?: DesignArtifact
  ): Promise<BuildArtifact> {
    // Support both calling conventions
    const idea =
      'idea' in ideaOrInput ? ideaOrInput.idea : ideaOrInput;
    const design =
      'design' in ideaOrInput ? ideaOrInput.design : d!;

    const projectDir = path.join(
      this.builderCfg.outputDir,
      `product-${Date.now()}`
    );
    await cleanDir(projectDir);

    logger.info('BUILDER', t('build.projectDir', { dir: projectDir }));
    logger.info(
      'BUILDER',
      t('build.spawning', { count: design.builderSpecs.length })
    );

    // Spawn all builder agents in parallel
    const builderResults = await this.spawnParallelBuilders(
      idea,
      design,
      projectDir
    );

    // Log per-builder outcomes
    for (const r of builderResults) {
      const tag = `BUILDER:${r.label}`;
      if (r.status === 'success') {
        logger.success(tag, t('build.generatedFiles', { count: r.fileCount }));
      } else {
        logger.error(tag, r.error ?? t('build.unknownError'));
      }
    }

    // Run integration pass — ensure everything wires together
    logger.info('INTEGRATION', t('build.merging'));
    await this.runIntegration(idea, design, projectDir);

    // Count generated files (excluding node_modules)
    const files = await this.countFiles(projectDir);

    const hasFailures = builderResults.some((r) => r.status === 'failure');

    return {
      repoPath: projectDir,
      fileCount: files,
      buildStatus: hasFailures ? 'failure' : 'success',
      errors: builderResults
        .filter((r) => r.status === 'failure')
        .map((r) => `${r.label}: ${r.error ?? 'unknown'}`),
    };
  }

  // ----------------------------------------------------------------
  // Parallel builder spawning
  // ----------------------------------------------------------------

  private async spawnParallelBuilders(
    idea: IdeaArtifact,
    design: DesignArtifact,
    projectDir: string
  ): Promise<BuilderResult[]> {
    const results: BuilderResult[] = [];

    const builderPromises = design.builderSpecs.map(async (spec) => {
      const result: BuilderResult = {
        type: spec.type,
        label: spec.label,
        fileCount: 0,
        status: 'success',
      };

      try {
        logger.info(
          `BUILDER:${spec.label}`,
          t('build.generatingFiles', { count: spec.files.length })
        );

        const prompt = this.buildBuilderPrompt(spec, idea, design, projectDir);

        const tokenBudget = Math.min(8192, spec.files.length * 2048);
        const response = await this.chatWithRetry(
          [{ role: 'user', content: prompt }],
          tokenBudget
        );

        // Emit builder output to event bus
        if (this.bus) {
          this.bus.emit({
            type: 'builder_output',
            phase: 'build',
            role: spec.label,
            content: response,
            meta: { files: spec.files, charCount: response.length },
          });
        }

        // Parse file outputs from the LLM response
        const files = this.parseFileOutputs(response);

        // Write files to the project directory
        for (const [filePath, content] of files) {
          const fullPath = path.join(projectDir, filePath);
          await ensureDir(path.dirname(fullPath));
          await writeFile(fullPath, content);
          logger.debug(`BUILDER:${spec.label}`, t('build.wrote', { path: filePath }));
        }

        result.fileCount = files.size;
        result.status = files.size > 0 ? 'success' : 'failure';
        if (result.status === 'failure') {
          result.error = t('build.noFileOutputs');
        }
      } catch (err: unknown) {
        result.status = 'failure';
        result.error =
          err instanceof Error ? err.message : String(err);
        logger.error(
          `BUILDER:${spec.label}`,
          t('build.failed', { error: result.error })
        );
      }

      return result;
    });

    const settled = await Promise.allSettled(builderPromises);
    for (const entry of settled) {
      if (entry.status === 'fulfilled') {
        results.push(entry.value);
      } else {
        results.push({
          type: 'unknown',
          label: 'unknown',
          fileCount: 0,
          status: 'failure',
          error:
            entry.reason instanceof Error
              ? entry.reason.message
              : String(entry.reason),
        });
      }
    }

    return results;
  }

  // ----------------------------------------------------------------
  // Builder prompt construction
  // ----------------------------------------------------------------

  private buildBuilderPrompt(
    spec: BuilderSpec,
    idea: IdeaArtifact,
    design: DesignArtifact,
    _projectDir: string
  ): string {
    const fileSection = spec.files
      .map((f) => `- ${f}`)
      .join('\n');

    const depsSection =
      spec.dependencies.length > 0
        ? `\nDEPENDENCIES: ${spec.dependencies.join(', ')}`
        : '';

    const pagesSection = design.pages
      .map((p) => `${p.name} (${p.route})`)
      .join(', ');

    const dataSection =
      design.dataModel &&
      Object.keys(design.dataModel.entities).length > 0
        ? `\nDATA MODEL:\n${JSON.stringify(design.dataModel, null, 2)}`
        : '';

    const langInstr = this.language.startsWith('zh')
      ? 'OUTPUT LANGUAGE: Chinese (中文). All user-facing text, comments, and UI labels in the generated code MUST be in Chinese. Code variables and function names remain in English.'
      : this.language.startsWith('ja')
      ? 'OUTPUT LANGUAGE: Japanese (日本語). All user-facing text, comments, and UI labels in the generated code MUST be in Japanese. Code variables and function names remain in English.'
      : this.language.startsWith('ko')
      ? 'OUTPUT LANGUAGE: Korean (한국어). All user-facing text, comments, and UI labels in the generated code MUST be in Korean. Code variables and function names remain in English.'
      : '';

    return `${langInstr ? langInstr + '\n\n' : ''}You are the ${spec.label} (${spec.type}). Generate complete, production-ready code for these files:

FILES TO CREATE:
${fileSection}
${depsSection}

PROJECT CONTEXT:
- Tagline: ${idea.tagline}
- Tech Stack: ${design.techStack}
- UI Theme: ${design.uiSpec.theme}, Primary Color: ${design.uiSpec.primaryColor}
- Pages: ${pagesSection}
${dataSection}

RULES:
1. Generate the COMPLETE content of each file listed above.
2. Use the EXACT format below for each file:
   --- FILE: path/to/file.ext ---
   [complete file content here]
   --- END FILE ---
3. Code must be production-ready, not placeholders.
4. Follow the tech stack and design specs exactly.
5. Include proper error handling, types, and comments.
6. Do NOT skip or abbreviate any file content.
7. For config builder: generate package.json with all needed dependencies, vite.config.ts, index.html, tsconfig.json, etc.
8. Do NOT wrap file content in markdown code blocks — put the raw content between the FILE markers.${langInstr}`;
  }

  // ----------------------------------------------------------------
  // File output parsing — handles multiple formats
  // ----------------------------------------------------------------

  private parseFileOutputs(response: string): Map<string, string> {
    const files = new Map<string, string>();

    // Strategy 1: Parse --- FILE: path --- ... --- END FILE --- blocks
    const fileMarkerRegex =
      /---\s*FILE:\s*(.+?)\s*---([\s\S]*?)---\s*END FILE\s*---/g;
    let match: RegExpExecArray | null;
    while ((match = fileMarkerRegex.exec(response)) !== null) {
      const filePath = match[1].trim();
      const content = this.trimContent(match[2]);
      if (filePath && content) {
        files.set(filePath, content);
      }
    }

    if (files.size > 0) return files;

    // Strategy 2: Parse fenced code blocks with filename hints
    //    ```ts:src/index.ts  or  ```typescript path=src/index.ts
    const fencedWithNameRegex =
      /```(?:\w+)?[:\s]+(\S+?)\s*\n([\s\S]*?)```/g;
    while ((match = fencedWithNameRegex.exec(response)) !== null) {
      const filePath = match[1].trim();
      const content = this.trimContent(match[2]);
      if (filePath && content) {
        files.set(filePath, content);
      }
    }

    if (files.size > 0) return files;

    // Strategy 3: Look for "filename.ext" headers followed by code
    //    ### src/App.tsx\n```tsx\n...\n```
    const headerCodeRegex =
      /(?:^|\n)#{1,4}\s*(\S+)\s*\n\s*```(?:\w+)?\n([\s\S]*?)```/g;
    while ((match = headerCodeRegex.exec(response)) !== null) {
      const filePath = match[1].trim();
      const content = this.trimContent(match[2]);
      if (filePath && content) {
        files.set(filePath, content);
      }
    }

    if (files.size > 0) return files;

    // Strategy 4: Fallback — treat entire response as a single file
    //    If there's nothing else, return it so downstream can log it
    const trimmed = this.trimContent(response);
    if (trimmed) {
      files.set('generated-output.txt', trimmed);
    }

    return files;
  }

  /** Strip leading/trailing whitespace and common markdown fences. */
  private trimContent(raw: string): string {
    let content = raw.trim();
    // Remove a single top-level fence if present
    if (content.startsWith('```') && content.endsWith('```')) {
      const firstLineBreak = content.indexOf('\n');
      if (firstLineBreak !== -1) {
        content = content.slice(firstLineBreak + 1, -3).trim();
      }
    }
    return content;
  }

  // ----------------------------------------------------------------
  // Integration pass
  // ----------------------------------------------------------------

  private async runIntegration(
    idea: IdeaArtifact,
    design: DesignArtifact,
    projectDir: string
  ): Promise<void> {
    logger.info('INTEGRATION', t('build.verifying'));

    // Verify that key files referenced by builder specs actually exist
    const missingFiles: string[] = [];
    for (const spec of design.builderSpecs) {
      for (const file of spec.files) {
        // Skip directory specs (they don't have extensions)
        if (!file.includes('.')) continue;
        const fullPath = path.join(projectDir, file);
        const exists = await fileExists(fullPath);
        if (!exists) {
          missingFiles.push(file);
        }
      }
    }

    if (missingFiles.length > 0) {
      logger.warn(
        'INTEGRATION',
        t('build.missingFiles', { files: missingFiles.join(', ') })
      );
    }

    // For web apps, ensure index.html exists at the project root
    const indexHtml = path.join(projectDir, 'index.html');
    if (await fileExists(indexHtml)) {
      let html = await readFile(indexHtml);
      // Ensure it references a JS entry point
      if (
        !html.includes('<script') &&
        !html.includes('src/main')
      ) {
        logger.warn(
          'INTEGRATION',
          t('build.noScriptTag')
        );
        html = html.replace(
          '</head>',
          '  <script type="module" src="/src/main.tsx"></script>\n</head>'
        );
        await writeFile(indexHtml, html);
      }
    }

    // Ensure tsconfig exists (if not already written by config builder)
    const tsconfig = path.join(projectDir, 'tsconfig.json');
    if (!(await fileExists(tsconfig))) {
      logger.info(
        'INTEGRATION',
        t('build.tsconfigMissing')
      );
      await writeJson(tsconfig, {
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
        },
        include: ['src'],
      });
    }

    logger.success('INTEGRATION', t('build.integrationComplete'));
  }

  // ----------------------------------------------------------------
  // File counting (excludes node_modules)
  // ----------------------------------------------------------------

  private async countFiles(dir: string): Promise<number> {
    let count = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git')
          continue;
        if (entry.isDirectory()) {
          count += await this.countFiles(path.join(dir, entry.name));
        } else {
          count++;
        }
      }
    } catch {
      // Directory may not exist yet — return 0
    }
    return count;
  }
}
