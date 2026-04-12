import { BaseAgent } from '../../core/agent.js';
import { logger } from '../../utils/logger.js';
import { writeFile, readFile, listFiles, fileExists } from '../../utils/fs-helpers.js';
import type { IdeaArtifact, DesignArtifact, BuildArtifact, ReviewArtifact, DeployArtifact } from '../../types/artifacts.js';
import type { EventBus } from '../../observability/event-bus.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as http from 'http';

const execAsync = promisify(exec);

/** Poll a URL until it responds or timeout. */
async function waitForServer(url: string, timeoutMs = 15000, intervalMs = 500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      await new Promise<void>((resolve, reject) => {
        http.get(url, (res) => {
          res.resume();
          res.on('end', () => resolve());
        }).on('error', reject);
      });
      return true;
    } catch {
      // server not ready yet
    }
  }
  return false;
}

export class DeployerAgent extends BaseAgent {
  private outputDir: string;
  private bus?: EventBus;
  private language: string;

  constructor(config: { apiKey?: string; baseUrl?: string; model?: string; outputDir: string; eventBus?: EventBus; language?: string }) {
    super({
      name: 'DeployerAgent',
      systemPrompt: 'You generate README documentation for products. Make it clear, comprehensive, and professional.',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      maxTokens: 4096,
      temperature: 0.5,
    });
    this.outputDir = config.outputDir;
    this.bus = config.eventBus;
    this.language = config.language || 'en';
  }

  async run(input: { idea: IdeaArtifact; design: DesignArtifact; build: BuildArtifact; review: ReviewArtifact }): Promise<DeployArtifact> {
    const { idea, design, build, review } = input;
    const projectDir = build.repoPath;

    logger.info('DEPLOYER', `Generating documentation for ${projectDir}`);

    // Generate README
    const readme = await this.generateReadme(idea, design, projectDir);
    const readmePath = path.join(projectDir, 'README.md');
    await writeFile(readmePath, readme);
    logger.success('DEPLOYER', 'README generated');

    // List all project files
    const files = await this.listProjectFiles(projectDir);

    // Try to start dev server
    let url = 'Run: npm run dev';
    try {
      logger.info('DEPLOYER', 'Installing dependencies...');
      await execAsync('npm install', { cwd: projectDir, timeout: 120000 });

      // Check if it's a Vite project
      const pkgPath = path.join(projectDir, 'package.json');
      if (await fileExists(pkgPath)) {
        const pkg = JSON.parse(await readFile(pkgPath));
        const scripts = pkg.scripts || {};
        if (scripts.dev) {
          logger.info('DEPLOYER', 'Starting dev server on port 5173...');
          // Start in background using spawn (don't wait for it to exit)
          spawn('npx', ['vite', '--port', '5173'], {
            cwd: projectDir,
            stdio: 'ignore',
            detached: true,
          }).unref();

          // Wait for server to be ready
          const ready = await waitForServer('http://localhost:5173');
          if (ready) {
            url = 'http://localhost:5173';
            logger.success('DEPLOYER', 'Dev server is ready at http://localhost:5173');
          } else {
            url = 'http://localhost:5173 (started, may still be initializing)';
            logger.warn('DEPLOYER', 'Dev server started but not responding yet');
          }
        } else if (scripts.start) {
          spawn('npm', ['start'], {
            cwd: projectDir,
            stdio: 'ignore',
            detached: true,
          }).unref();
          const ready = await waitForServer('http://localhost:3000');
          if (ready) {
            url = 'http://localhost:3000';
            logger.success('DEPLOYER', 'Dev server is ready at http://localhost:3000');
          } else {
            url = 'http://localhost:3000 (started, may still be initializing)';
            logger.warn('DEPLOYER', 'Dev server started but not responding yet');
          }
        }
      }
    } catch {
      logger.warn('DEPLOYER', 'Could not auto-start dev server');
    }

    // Generate summary
    const summary = this.generateSummary(idea, design, files);

    // Emit deploy summary to event bus
    if (this.bus) {
      this.bus.emit({
        type: 'deploy_summary',
        phase: 'deploy',
        role: 'DEPLOYER',
        content: summary,
        meta: { url, files: files.length },
      });
    }

    return {
      url,
      readmePath,
      summary,
      files,
    };
  }

  private async generateReadme(idea: IdeaArtifact, design: DesignArtifact, projectDir: string): Promise<string> {
    const allFiles = await listFiles(projectDir);
    const techFiles = allFiles
      .filter(f => {
        const rel = path.relative(projectDir, f);
        return !rel.includes('node_modules') && !rel.includes('.git') &&
          (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') ||
           f.endsWith('.jsx') || f.endsWith('.css'));
      })
      .slice(0, 15);

    const fileContents: Record<string, string> = {};
    for (const file of techFiles) {
      try {
        const relPath = path.relative(projectDir, file);
        fileContents[relPath] = (await readFile(file)).slice(0, 2000);
      } catch {
        // skip unreadable files
      }
    }

    const langInstr = this.language.startsWith('zh')
      ? 'OUTPUT LANGUAGE: Chinese (中文). The entire README MUST be written in Chinese.'
      : this.language.startsWith('ja')
      ? 'OUTPUT LANGUAGE: Japanese (日本語). The entire README MUST be written in Japanese.'
      : this.language.startsWith('ko')
      ? 'OUTPUT LANGUAGE: Korean (한국어). The entire README MUST be written in Korean.'
      : '';

    const response = await this.chat([{
      role: 'user',
      content: `${langInstr ? langInstr + '\n\n' : ''}Generate a comprehensive README.md for this product:

PRODUCT: ${idea.tagline}
FEATURES: ${idea.features.map((f, i) => `${i + 1}. ${f}`).join('\n')}
TARGET USER: ${idea.targetUser}
TECH STACK: ${design.techStack}
PAGES: ${design.pages.map(p => `${p.name} (${p.route})`).join(', ')}

Project files: ${JSON.stringify(fileContents).slice(0, 10000)}

Include:
- Project title and tagline
- Brief description
- Features list
- Tech stack
- Getting started (install, run dev, build)
- Project structure
- Screenshots placeholder
- License`,
    }], 4096);

    return response;
  }

  private async listProjectFiles(projectDir: string): Promise<string[]> {
    const allFiles = await listFiles(projectDir);
    return allFiles
      .map(f => path.relative(projectDir, f))
      .filter(f => !f.includes('node_modules') && !f.includes('.git'));
  }

  private generateSummary(idea: IdeaArtifact, design: DesignArtifact, files: string[]): string {
    const lines = [
      `Product: ${idea.tagline}`,
      `Features: ${idea.features.join(', ')}`,
      `Pages: ${design.pages.map(p => p.name).join(', ')}`,
      `Tech Stack: ${design.techStack}`,
      `Files: ${files.length}`,
      'Structure:',
      ...files.slice(0, 30).map(f => `  - ${f}`),
    ];
    return lines.join('\n');
  }
}
