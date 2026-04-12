#!/usr/bin/env node
import { Command } from 'commander';
import { Orchestrator } from './core/orchestrator.js';
import { resolveConfig, validateConfig, printConfig } from './core/config.js';
import * as path from 'path';
import * as url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const cli = new Command();

cli
  .name('idea-to-product')
  .description('Autonomous idea-to-product agent system — from brainstorm to shipped product')
  .version('0.1.0')
  .argument('[prompt]', 'Product idea prompt (leave empty for random brainstorm)', undefined)
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-s, --state <dir>', 'State directory', './.idea-state')
  .option('-v, --verbose', 'Verbose logging', false)
  .option('-k, --api-key <key>', 'Anthropic API key (or set ANTHROPIC_API_KEY env)')
  .option('-m, --model <model>', 'Model to use (or set MODEL / ANTHROPIC_MODEL env)')
  .option('-b, --base-url <url>', 'API base URL for proxy/compatible API (or set BASE_URL / ANTHROPIC_BASE_URL env)')
  .option('--max-tokens <n>', 'Max tokens per request', undefined)
  .option('--temperature <n>', 'Temperature for generation', undefined)
  .action(async (prompt, options) => {
    const cfg = resolveConfig({
      apiKey: options.apiKey,
      model: options.model,
      baseUrl: options.baseUrl,
      maxTokens: options.maxTokens ? parseInt(options.maxTokens, 10) : undefined,
      temperature: options.temperature ? parseFloat(options.temperature) : undefined,
    });

    const errors = validateConfig(cfg);
    if (errors.length > 0) {
      console.error('Configuration errors:');
      errors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }

    printConfig(cfg);

    const orchestrator = new Orchestrator({
      outputDir: path.resolve(options.output),
      stateDir: path.resolve(options.state),
      verbose: options.verbose,
      apiKey: cfg.apiKey,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
    });

    try {
      await orchestrator.run(prompt);
    } catch (error) {
      console.error('Pipeline failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

cli.parse();
