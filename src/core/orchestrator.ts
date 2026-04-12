import { IdeaGenArena } from '../agents/idea-gen/arena.js';
import { DesignerAgent } from '../agents/designer/index.js';
import { DynamicBuilderAgent } from '../agents/builder/index.js';
import { ReviewerAgent } from '../agents/reviewer/index.js';
import { DeployerAgent } from '../agents/deployer/index.js';
import { logger } from '../utils/logger.js';
import { ensureDir, writeJson } from '../utils/fs-helpers.js';
import type {
  IdeaArtifact,
  DesignArtifact,
  BuildArtifact,
  ReviewArtifact,
  DeployArtifact,
  PipelineResult,
} from '../types/artifacts.js';
import * as path from 'path';

export interface OrchestratorConfig {
  outputDir: string;
  stateDir: string;
  verbose: boolean;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
}

export class Orchestrator {
  private config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.config = config;
  }

  async run(userPrompt?: string): Promise<PipelineResult> {
    logger.setVerbose(this.config.verbose);
    await ensureDir(this.config.outputDir);
    await ensureDir(this.config.stateDir);

    logger.info('🚀', '=== Idea-to-Product Pipeline Started ===');
    logger.info('CONFIG', `Output: ${this.config.outputDir}`);
    logger.info('CONFIG', `Model: ${this.config.model}`);
    if (this.config.baseUrl) {
      logger.info('CONFIG', `Base URL: ${this.config.baseUrl}`);
    }

    const result: Partial<PipelineResult> = {};

    try {
      // Phase 1: Idea Generation (6-role debate arena)
      result.idea = await this.runIdeaGen(userPrompt);
      await this.saveState('idea', result.idea);
      logger.success('IDEA', result.idea.tagline);

      // Phase 2: Design
      result.design = await this.runDesign(result.idea);
      await this.saveState('design', result.design);
      logger.success('DESIGN', `${result.design.pages.length} pages, ${result.design.builderSpecs.length} builders`);

      // Phase 3: Dynamic Build (parallel agents based on design)
      result.build = await this.runBuild(result.idea, result.design);
      await this.saveState('build', result.build);

      if (result.build.buildStatus === 'failure') {
        logger.error('BUILD', `Build failed: ${result.build.errors?.join('; ') || 'no details'}`);
        throw new Error('Build phase failed — cannot proceed without generated code');
      }

      logger.success('BUILD', `${result.build.fileCount} files created`);

      // Phase 4: Review + Polish
      result.review = await this.runReview(result.idea, result.design, result.build);
      await this.saveState('review', result.review);
      logger.success(result.review.passed ? 'REVIEW' : 'REVIEW*',
        result.review.passed ? 'Passed' : `Passed with ${result.review.fixes.length} fixes`);

      // Phase 5: Deploy
      result.deploy = await this.runDeploy(result.idea, result.design, result.build, result.review);
      await this.saveState('deploy', result.deploy);
      logger.success('DEPLOY', result.deploy.url || 'Ready to run');

      logger.success('DONE', 'Product complete!');
      this.printSummary(result as PipelineResult);

      return result as PipelineResult;
    } catch (error) {
      logger.error('FATAL', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async runIdeaGen(userPrompt?: string): Promise<IdeaArtifact> {
    logger.info('PHASE 1', 'Launching Idea Arena (6-role debate)...');
    const arena = new IdeaGenArena({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      verbose: this.config.verbose,
    });
    return arena.run(userPrompt);
  }

  private async runDesign(idea: IdeaArtifact): Promise<DesignArtifact> {
    logger.info('PHASE 2', 'Designing product architecture...');
    const designer = new DesignerAgent({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
    });
    return designer.run(idea);
  }

  private async runBuild(idea: IdeaArtifact, design: DesignArtifact): Promise<BuildArtifact> {
    logger.info('PHASE 3', `Spawning ${design.builderSpecs.length} parallel builders...`);
    const builder = new DynamicBuilderAgent({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      outputDir: this.config.outputDir,
    });
    return builder.run(idea, design);
  }

  private async runReview(idea: IdeaArtifact, design: DesignArtifact, build: BuildArtifact): Promise<ReviewArtifact> {
    logger.info('PHASE 4', 'Running code review and polish...');
    const reviewer = new ReviewerAgent({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
    });
    return reviewer.run({ idea, design, build });
  }

  private async runDeploy(idea: IdeaArtifact, design: DesignArtifact, build: BuildArtifact, review: ReviewArtifact): Promise<DeployArtifact> {
    logger.info('PHASE 5', 'Deploying product...');
    const deployer = new DeployerAgent({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      outputDir: this.config.outputDir,
    });
    return deployer.run({ idea, design, build, review });
  }

  private async saveState(stage: string, data: unknown): Promise<void> {
    await writeJson(path.join(this.config.stateDir, `${stage}.json`), data);
  }

  private printSummary(result: PipelineResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('  PRODUCT COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Tagline: ${result.idea.tagline}`);
    console.log(`  Features: ${result.idea.features.join(', ')}`);
    console.log(`  Pages: ${result.design.pages.map(p => p.name).join(', ')}`);
    console.log(`  Files: ${result.build.fileCount}`);
    console.log(`  URL: ${result.deploy.url}`);
    console.log('='.repeat(60));
  }
}
