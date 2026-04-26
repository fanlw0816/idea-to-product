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
import { t } from '../i18n/index.js';
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
  private stopping = false;  // Flag to stop pipeline

  constructor(config: OrchestratorConfig) {
    this.config = config;
  }

  /** Request to stop the pipeline execution */
  stop(): void {
    this.stopping = true;
    this.eventBus.emit({
      type: 'error',
      phase: 'system',
      role: 'Orchestrator',
      content: t('web.stopRequested'),
      meta: { reason: 'user_stop' },
    });
  }

  /** Check if stop was requested */
  isStopping(): boolean {
    return this.stopping;
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
        onStop: () => this.stop(),  // Pass stop callback
      });
      const url = await webServer.start();
      logger.info('WEB UI', t('web.startedAt', { url }));
    }

    // Phase start event
    this.eventBus.emit({
      type: 'phase_start',
      phase: 'idea',
      role: 'orchestrator',
      content: t('cli.prompt', { prompt: userPrompt || t('cli.randomBrainstorm') }),
      meta: { model: this.config.model },
    });

    logger.info('🚀', `=== ${t('phase.pipelineStart')} ===`);
    logger.info('CONFIG', `${t('config.output')}: ${this.config.outputDir}`);
    logger.info('CONFIG', `${t('config.model')}: ${this.config.model}`);
    logger.info('CONFIG', `${t('config.language')}: ${this.config.language}`);
    if (this.config.baseUrl) {
      logger.info('CONFIG', `${t('config.baseUrl')}: ${this.config.baseUrl}`);
    }

    const result: Partial<PipelineResult> = {};

    try {
      // Phase 1: Idea Generation (6-role debate arena)
      result.idea = await this.runIdeaGen(userPrompt);
      if (this.stopping) throw new Error('Pipeline stopped by user');
      await this.saveState('idea', result.idea);
      logger.success('IDEA', t('idea.success', { tagline: result.idea.tagline }));

      // Phase 2: Design
      result.design = await this.runDesign(result.idea);
      if (this.stopping) throw new Error('Pipeline stopped by user');
      await this.saveState('design', result.design);
      logger.success('DESIGN', t('idea.pagesBuilders', { pages: result.design.pages.length, builders: result.design.builderSpecs.length }));

      // Phase 3: Dynamic Build (parallel agents based on design)
      result.build = await this.runBuild(result.idea, result.design);
      if (this.stopping) throw new Error('Pipeline stopped by user');
      await this.saveState('build', result.build);

      if (result.build.buildStatus === 'failure') {
        logger.error('BUILD', t('build.buildFailed', { errors: result.build.errors?.join('; ') || 'no details' }));
        throw new Error(t('build.buildPhaseFailed'));
      }

      logger.success('BUILD', t('build.filesCreated', { count: result.build.fileCount }));

      // Phase 4: Review + Polish
      result.review = await this.runReview(result.idea, result.design, result.build);
      if (this.stopping) throw new Error('Pipeline stopped by user');
      await this.saveState('review', result.review);
      logger.success(result.review.passed ? 'REVIEW' : 'REVIEW*',
        result.review.passed ? t('summary.passed') : t('summary.passedWithFixes', { count: result.review.fixes.length }));

      // Phase 5: Deploy
      result.deploy = await this.runDeploy(result.idea, result.design, result.build, result.review);
      if (this.stopping) throw new Error('Pipeline stopped by user');
      await this.saveState('deploy', result.deploy);
      logger.success('DEPLOY', result.deploy.url || t('summary.ready'));

      // Generate persistent reports
      const reportPath = this.reportGen.save();
      const jsonPath = this.reportGen.saveJsonSummary();
      logger.success('REPORT', `${t('summary.markdown')}: ${reportPath}`);
      logger.success('REPORT', `${t('summary.jsonEvents')}: ${jsonPath}`);

      logger.success('DONE', t('summary.productComplete'));
      this.printSummary(result as PipelineResult);

      return result as PipelineResult;
    } catch (error) {
      logger.error('FATAL', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async runIdeaGen(userPrompt?: string): Promise<IdeaArtifact> {
    logger.info('PHASE 1', t('phase.idea.start'));
    this.eventBus.emit({
      type: 'phase_start', phase: 'idea', role: 'Idea Arena',
      content: t('phase.idea.debateStart'),
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
    logger.info('PHASE 2', t('phase.design.start'));
    this.eventBus.emit({
      type: 'phase_start', phase: 'design', role: 'Designer',
      content: t('phase.design.progress', { tagline: idea.tagline }),
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
      content: t('idea.pagesBuilders', { pages: design.pages.length, builders: design.builderSpecs.length }),
      meta: { pages: design.pages.length, builders: design.builderSpecs.length, techStack: design.techStack },
    });
    return design;
  }

  private async runBuild(idea: IdeaArtifact, design: DesignArtifact): Promise<BuildArtifact> {
    logger.info('PHASE 3', t('phase.build.start', { count: design.builderSpecs.length }));
    this.eventBus.emit({
      type: 'phase_start', phase: 'build', role: 'Builder',
      content: t('phase.build.spawning', { count: design.builderSpecs.length }),
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
      content: t('build.filesGenerated', { count: build.fileCount }),
      meta: { fileCount: build.fileCount, status: build.buildStatus },
    });
    return build;
  }

  private async runReview(idea: IdeaArtifact, design: DesignArtifact, build: BuildArtifact): Promise<ReviewArtifact> {
    logger.info('PHASE 4', t('phase.review.start'));
    this.eventBus.emit({
      type: 'phase_start', phase: 'review', role: 'Reviewer',
      content: t('phase.review.desc'),
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
      content: review.passed ? t('summary.passed') : t('summary.passedWithFixes', { count: review.fixes.length }),
      meta: { passed: review.passed, issues: review.issues.length, fixes: review.fixes.length },
    });
    return review;
  }

  private async runDeploy(idea: IdeaArtifact, design: DesignArtifact, build: BuildArtifact, review: ReviewArtifact): Promise<DeployArtifact> {
    logger.info('PHASE 5', t('phase.deploy.start'));
    this.eventBus.emit({
      type: 'phase_start', phase: 'deploy', role: 'Deployer',
      content: t('phase.deploy.desc'),
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
      content: deploy.url || t('summary.ready2'),
      meta: { url: deploy.url, files: deploy.files.length },
    });
    return deploy;
  }

  private async saveState(stage: string, data: unknown): Promise<void> {
    await writeJson(path.join(this.config.stateDir, `${stage}.json`), data);
  }

  private printSummary(result: PipelineResult): void {
    console.log('\n' + '='.repeat(60));
    console.log(`  ${t('summary.title')}`);
    console.log('='.repeat(60));
    console.log(`  ${t('summary.tagline')}: ${result.idea.tagline}`);
    console.log(`  ${t('summary.features')}: ${result.idea.features.join(', ')}`);
    console.log(`  ${t('summary.pages')}: ${result.design.pages.map(p => p.name).join(', ')}`);
    console.log(`  ${t('summary.files')}: ${result.build.fileCount}`);
    console.log(`  ${t('summary.url')}: ${result.deploy.url}`);
    console.log('='.repeat(60));
  }
}
