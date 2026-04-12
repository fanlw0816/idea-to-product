import { BaseAgent } from '../../core/agent.js';
import { logger } from '../../utils/logger.js';
import { writeFile, readFile, listFiles, fileExists } from '../../utils/fs-helpers.js';
import type { IdeaArtifact, DesignArtifact, BuildArtifact, ReviewArtifact, DeployArtifact } from '../../types/artifacts.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DeployerAgent extends BaseAgent {
  private outputDir: string;

  constructor(config: { apiKey?: string; outputDir: string }) {
    super({
      name: 'DeployerAgent',
      systemPrompt: 'You generate README documentation for products. Make it clear, comprehensive, and professional.',
      apiKey: config.apiKey,
      maxTokens: 4096,
      temperature: 0.5,
    });
    this.outputDir = config.outputDir;
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
          // Start in background
          execAsync('npx vite --port 5173', { cwd: projectDir, timeout: 30000 }).catch(() => {});
          url = 'http://localhost:5173';
        } else if (scripts.start) {
          execAsync('npm start', { cwd: projectDir, timeout: 30000 }).catch(() => {});
          url = 'http://localhost:3000';
        }
      }
    } catch {
      logger.warn('DEPLOYER', 'Could not auto-start dev server');
    }

    // Generate summary
    const summary = this.generateSummary(idea, design, files);

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

    const response = await this.chat([{
      role: 'user',
      content: `Generate a comprehensive README.md for this product:

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
