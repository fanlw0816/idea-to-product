import { BaseAgent } from '../../core/agent.js';
import { logger } from '../../utils/logger.js';
import { readFile, writeFile, fileExists, listFiles } from '../../utils/fs-helpers.js';
import type { IdeaArtifact, DesignArtifact, BuildArtifact, ReviewArtifact, ReviewIssue } from '../../types/artifacts.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export class ReviewerAgent extends BaseAgent {
  private maxRetries = 3;

  constructor(config: { apiKey?: string; baseUrl?: string; model?: string }) {
    super({
      name: 'ReviewerAgent',
      systemPrompt: `You are a senior code reviewer and fixer. Your job:
1. Analyze build errors and fix them
2. Review code quality and suggest/apply improvements
3. Ensure all features from the design are implemented
4. Make the code production-ready

When fixing build errors:
- Be precise about what file and line has the issue
- Provide the corrected code for the file
- Fix the root cause, not symptoms

When asked to fix errors, respond with file markers:
--- FILE: path/to/file ---
[full corrected file content]
--- END FILE ---`,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      maxTokens: 8192,
      temperature: 0.3,
    });
  }

  async run(input: { idea: IdeaArtifact; design: DesignArtifact; build: BuildArtifact }): Promise<ReviewArtifact> {
    const { idea, design, build } = input;
    const projectDir = build.repoPath;

    logger.info('REVIEWER', `Reviewing project at ${projectDir}`);

    const issues: ReviewIssue[] = [];
    const fixes: string[] = [];
    let buildOk = false;

    // Phase 1: Try to build and fix errors (up to maxRetries)
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      logger.info('REVIEWER', `Build attempt ${attempt}/${this.maxRetries}...`);

      const result = await this.tryBuild(projectDir);

      if (result.ok) {
        buildOk = true;
        logger.success('REVIEWER', `Build succeeded on attempt ${attempt}`);
        break;
      }

      logger.warn('REVIEWER', `Build failed: ${result.errors.slice(0, 3).join('; ')}`);
      issues.push(...result.errors.map(e => ({
        file: 'build',
        severity: 'error' as const,
        message: e,
      })));

      if (attempt < this.maxRetries) {
        const fixResult = await this.fixBuildErrors(projectDir, result.errors);
        if (fixResult.fixed) {
          for (const change of fixResult.changes) {
            try {
              const filePath = path.join(projectDir, change.file);
              const existing = await fileExists(filePath);
              if (existing) {
                await writeFile(filePath, change.content);
                fixes.push(`Fixed ${change.file}: ${change.reason}`);
                logger.info('REVIEWER', `Fixed: ${change.file}`);
              }
            } catch {
              logger.warn('REVIEWER', `Failed to write fix for ${change.file}`);
            }
          }
        } else {
          logger.warn('REVIEWER', 'No fix found, retrying...');
        }
      }
    }

    // Phase 2: Code quality review (static analysis)
    logger.info('REVIEWER', 'Running code quality review...');
    const qualityIssues = await this.reviewCodeQuality(projectDir, idea, design);
    issues.push(...qualityIssues);

    // Phase 3: Feature completeness check
    logger.info('REVIEWER', 'Checking feature completeness...');
    const featuresComplete = await this.checkFeatureCompleteness(projectDir, design);

    return {
      passed: buildOk && !issues.some(i => i.severity === 'error'),
      issues,
      fixes,
      testResults: {
        lintOk: !issues.some(i => i.message.includes('lint') || i.message.includes('Lint')),
        buildOk,
        featuresComplete,
      },
    };
  }

  private async tryBuild(projectDir: string): Promise<{ ok: boolean; errors: string[] }> {
    try {
      // Install dependencies first
      await execAsync('npm install', { cwd: projectDir, timeout: 120000 });
    } catch {
      // npm install may fail if no package.json — continue to type check
    }

    // Try TypeScript type-check first
    try {
      await execAsync('npx tsc --noEmit', { cwd: projectDir, timeout: 60000 });
      return { ok: true, errors: [] };
    } catch {
      // tsc failed — fall through to npm run build
    }

    // Try npm run build
    try {
      await execAsync('npm run build', { cwd: projectDir, timeout: 60000 });
      return { ok: true, errors: [] };
    } catch (error: any) {
      const output = (error.stdout || '') + (error.stderr || '');
      const errors = output.split('\n')
        .filter((line: string) => line.includes('error') || line.includes('Error') || line.includes('ERROR'))
        .slice(0, 10);

      return { ok: false, errors: errors.length > 0 ? errors : [output.slice(0, 500)] };
    }
  }

  private async fixBuildErrors(
    projectDir: string,
    errors: string[]
  ): Promise<{ fixed: boolean; changes: Array<{ file: string; content: string; reason: string }> }> {
    const errorContext = errors.join('\n');

    // List all project files for context
    const allFiles = await listFiles(projectDir);
    const relevantFiles = allFiles
      .filter(f => {
        const rel = path.relative(projectDir, f);
        return !rel.includes('node_modules') && !rel.includes('.git');
      })
      .filter(f =>
        f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') ||
        f.endsWith('.jsx') || f.endsWith('.json') || f.endsWith('.css')
      )
      .slice(0, 20);

    const fileContents: Record<string, string> = {};
    for (const file of relevantFiles.slice(0, 10)) {
      try {
        const relPath = path.relative(projectDir, file);
        fileContents[relPath] = await readFile(file);
      } catch {
        // skip unreadable files
      }
    }

    const response = await this.chat([{
      role: 'user',
      content: `Build errors:\n${errorContext}\n\nProject files:\n${relevantFiles.map(f => path.relative(projectDir, f)).join('\n')}\n\nKey file contents:\n${JSON.stringify(fileContents).slice(0, 8000)}\n\nFix these errors. Return the FULL corrected file content for each file that needs changes. Format:\n--- FILE: path/to/file ---\n[content]\n--- END FILE ---`,
    }], 8192);

    const changes: Array<{ file: string; content: string; reason: string }> = [];
    const regex = /---\s*FILE:\s*(.+?)\s*---\n([\s\S]*?)---\s*END FILE/g;
    let match;
    while ((match = regex.exec(response)) !== null) {
      changes.push({
        file: match[1].trim(),
        content: match[2].trim(),
        reason: 'Build fix for errors',
      });
    }

    return { fixed: changes.length > 0, changes };
  }

  private async reviewCodeQuality(
    projectDir: string,
    _idea: IdeaArtifact,
    _design: DesignArtifact
  ): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    try {
      const allFiles = await listFiles(projectDir);
      const tsFiles = allFiles.filter(f => {
        const rel = path.relative(projectDir, f);
        return !rel.includes('node_modules') && !rel.includes('.git') &&
          (f.endsWith('.ts') || f.endsWith('.tsx'));
      });

      for (const file of tsFiles) {
        const content = await readFile(file);
        const relPath = path.relative(projectDir, file);

        // Check for common issues
        if (content.includes(': any')) {
          issues.push({
            file: relPath,
            severity: 'warning',
            message: 'Uses "any" type - consider using proper types',
          });
        }
        if (content.includes('console.log')) {
          issues.push({
            file: relPath,
            severity: 'suggestion',
            message: 'Has console.log statements - consider removing or using a logger',
          });
        }
        if (content.length > 500) {
          issues.push({
            file: relPath,
            severity: 'suggestion',
            message: `File is ${Math.round(content.length / 100) / 10}KB - consider splitting`,
          });
        }
      }
    } catch {
      // skip if files can't be read
    }

    return issues;
  }

  private async checkFeatureCompleteness(
    projectDir: string,
    design: DesignArtifact
  ): Promise<boolean> {
    try {
      const allFiles = await listFiles(projectDir);
      const sourceFiles = allFiles.filter(f => {
        const rel = path.relative(projectDir, f);
        return !rel.includes('node_modules') && !rel.includes('.git') &&
          (f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.html'));
      });

      const allContent = await Promise.all(
        sourceFiles.map(f => readFile(f).catch(() => ''))
      );
      const combined = allContent.join('\n').toLowerCase();

      // Check if all page names appear in the code
      const pagesPresent = design.pages.every(p =>
        combined.includes(p.name.toLowerCase()) || combined.includes(p.route.toLowerCase())
      );

      return pagesPresent;
    } catch {
      return false;
    }
  }
}
