import type { WebServer } from '../web/server/index.js';
import { IdeaGenArena } from '../agents/idea-gen/arena.js';
import { DesignerAgent } from '../agents/designer/index.js';
import { DynamicBuilderAgent } from '../agents/builder/index.js';
import { ReviewerAgent } from '../agents/reviewer/index.js';
import { DeployerAgent } from '../agents/deployer/index.js';
import { logger } from '../utils/logger.js';
import { ensureDir, writeJson } from '../utils/fs-helpers.js';
import { EventBus } from '../observability/event-bus.js';
import { TerminalFormatter } from '../observability/terminal-formatter.js';
import { ReportGenerator } from '../observability/report-generator.js';
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
  language: string;
  startWeb?: boolean;
  webPort?: number;
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private eventBus!: EventBus;
  private reportGen!: ReportGenerator;

  constructor(config: OrchestratorConfig) {
    this.config = config;
  }

  async run(userPrompt?: string): Promise<PipelineResult> {
    logger.setVerbose(this.config.verbose);
    await ensureDir(this.config.outputDir);
    await ensureDir(this.config.stateDir);

    // Initialize observability
    this.eventBus = new EventBus(this.config.stateDir);
    this.reportGen = new ReportGenerator(this.eventBus, this.config.stateDir);
    TerminalFormatter.attachTo(this.eventBus);

    // Start web server if requested
    let webServer: WebServer | undefined;
    if (this.config.startWeb) {
      const { WebServer } = await import('../web/server/index.js');
      webServer = new WebServer({
        port: this.config.webPort || 8080,
        eventBus: this.eventBus,
      });
      const url = await webServer.start();
      logger.info('WEB UI', `Started at ${url}`);
    }

    // Phase start event
    this.eventBus.emit({
      type: 'phase_start',
      phase: 'idea',
      role: 'orchestrator',
      content: `Prompt: ${userPrompt || 'random brainstorm'}`,
      meta: { model: this.config.model },
    });

    logger.info('🚀', '=== Idea-to-Product Pipeline Started ===');
    logger.info('CONFIG', `Output: ${this.config.outputDir}`);
    logger.info('CONFIG', `Model: ${this.config.model}`);
    logger.info('CONFIG', `Language: ${this.config.language}`);
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

      // Generate persistent reports
      const reportPath = this.reportGen.save();
      const jsonPath = this.reportGen.saveJsonSummary();
      logger.success('REPORT', `Markdown: ${reportPath}`);
      logger.success('REPORT', `JSON events: ${jsonPath}`);

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
    this.eventBus.emit({
      type: 'phase_start', phase: 'idea', role: 'Idea Arena',
      content: '6-Agent structured debate starting',
      meta: { rounds: 3, roles: 6 },
    });
    const arena = new IdeaGenArena({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      verbose: this.config.verbose,
      eventBus: this.eventBus,
      language: this.config.language,
    });
    const idea = await arena.run(userPrompt);
    this.eventBus.emit({
      type: 'phase_end', phase: 'idea', role: 'Idea Arena',
      content: idea.tagline,
      meta: { tagline: idea.tagline, targetUser: idea.targetUser, confidence: idea.confidence },
    });
    return idea;
  }

  private async runDesign(idea: IdeaArtifact): Promise<DesignArtifact> {
    logger.info('PHASE 2', 'Designing product architecture...');
    this.eventBus.emit({
      type: 'phase_start', phase: 'design', role: 'Designer',
      content: `Designing: ${idea.tagline}`,
      meta: {},
    });
    const designer = new DesignerAgent({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      eventBus: this.eventBus,
      language: this.config.language,
    });
    const design = await designer.run(idea);
    this.eventBus.emit({
      type: 'phase_end', phase: 'design', role: 'Designer',
      content: `${design.pages.length} pages, ${design.builderSpecs.length} builders`,
      meta: { pages: design.pages.length, builders: design.builderSpecs.length, techStack: design.techStack },
    });
    return design;
  }

  private async runBuild(idea: IdeaArtifact, design: DesignArtifact): Promise<BuildArtifact> {
    logger.info('PHASE 3', `Spawning ${design.builderSpecs.length} parallel builders...`);
    this.eventBus.emit({
      type: 'phase_start', phase: 'build', role: 'Builder',
      content: `${design.builderSpecs.length} parallel builders spawning`,
      meta: { builderCount: design.builderSpecs.length },
    });
    const builder = new DynamicBuilderAgent({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      outputDir: this.config.outputDir,
      eventBus: this.eventBus,
      language: this.config.language,
    });
    const build = await builder.run(idea, design);
    this.eventBus.emit({
      type: 'phase_end', phase: 'build', role: 'Builder',
      content: `${build.fileCount} files generated`,
      meta: { fileCount: build.fileCount, status: build.buildStatus },
    });
    return build;
  }

  private async runReview(idea: IdeaArtifact, design: DesignArtifact, build: BuildArtifact): Promise<ReviewArtifact> {
    logger.info('PHASE 4', 'Running code review and polish...');
    this.eventBus.emit({
      type: 'phase_start', phase: 'review', role: 'Reviewer',
      content: 'Code quality review and build fix pass',
      meta: {},
    });
    const reviewer = new ReviewerAgent({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      eventBus: this.eventBus,
      language: this.config.language,
    });
    const review = await reviewer.run({ idea, design, build });
    this.eventBus.emit({
      type: 'phase_end', phase: 'review', role: 'Reviewer',
      content: review.passed ? 'Review passed' : `Passed with ${review.fixes.length} fixes`,
      meta: { passed: review.passed, issues: review.issues.length, fixes: review.fixes.length },
    });
    return review;
  }

  private async runDeploy(idea: IdeaArtifact, design: DesignArtifact, build: BuildArtifact, review: ReviewArtifact): Promise<DeployArtifact> {
    logger.info('PHASE 5', 'Deploying product...');
    this.eventBus.emit({
      type: 'phase_start', phase: 'deploy', role: 'Deployer',
      content: 'Generating documentation and starting dev server',
      meta: {},
    });
    const deployer = new DeployerAgent({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      outputDir: this.config.outputDir,
      eventBus: this.eventBus,
      language: this.config.language,
    });
    const deploy = await deployer.run({ idea, design, build, review });
    this.eventBus.emit({
      type: 'phase_end', phase: 'deploy', role: 'Deployer',
      content: deploy.url || 'Ready',
      meta: { url: deploy.url, files: deploy.files.length },
    });
    return deploy;
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
