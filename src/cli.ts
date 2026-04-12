#!/usr/bin/env node
import { Command } from 'commander';
import { Orchestrator } from './core/orchestrator.js';
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
  .action(async (prompt, options) => {
    const orchestrator = new Orchestrator({
      outputDir: path.resolve(options.output),
      stateDir: path.resolve(options.state),
      verbose: options.verbose,
      apiKey: options.apiKey,
    });

    try {
      await orchestrator.run(prompt);
    } catch (error) {
      console.error('Pipeline failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

cli.parse();
