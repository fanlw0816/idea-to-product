// ============================================================
// Global configuration — reads from CLI > env > config file > defaults
// ============================================================

import * as fs from 'fs';
import * as path from 'path';

export interface AgentRuntimeConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
}

// Default models for different agent roles
export const DEFAULT_MODELS = {
  ideaGen: 'claude-sonnet-4-6-20250514',
  designer: 'claude-sonnet-4-6-20250514',
  builder: 'claude-sonnet-4-6-20250514',
  reviewer: 'claude-sonnet-4-6-20250514',
  deployer: 'claude-sonnet-4-6-20250514',
} as const;

// Config file search paths
const CONFIG_FILENAMES = [
  '.idea-agent.json',
  '.idea-agent.jsonc',
  'idea-agent.config.json',
];

function findConfigFile(): string | null {
  let dir = process.cwd();
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached root
    dir = parent;
  }
  return null;
}

function loadConfigFile(): Partial<AgentRuntimeConfig> {
  const filePath = findConfigFile();
  if (!filePath) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    // Strip JSONC comments
    const cleaned = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return JSON.parse(cleaned);
  } catch {
    return {};
  }
}

function resolveEnv(): Partial<AgentRuntimeConfig> {
  const result: Partial<AgentRuntimeConfig> = {};
  if (process.env.ANTHROPIC_API_KEY) result.apiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    // Fallback: some providers use OPENAI_API_KEY
    result.apiKey = process.env.OPENAI_API_KEY;
  }
  if (process.env.MODEL) result.model = process.env.MODEL;
  if (process.env.ANTHROPIC_MODEL) result.model = process.env.ANTHROPIC_MODEL;
  if (process.env.BASE_URL) result.baseUrl = process.env.BASE_URL;
  if (process.env.ANTHROPIC_BASE_URL) result.baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (process.env.OPENAI_BASE_URL && !process.env.ANTHROPIC_BASE_URL && !process.env.BASE_URL) {
    result.baseUrl = process.env.OPENAI_BASE_URL;
  }
  if (process.env.MAX_TOKENS) result.maxTokens = parseInt(process.env.MAX_TOKENS, 10);
  if (process.env.TEMPERATURE) result.temperature = parseFloat(process.env.TEMPERATURE);
  return result;
}

export function resolveConfig(cliOptions: {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}): AgentRuntimeConfig {
  const fileConfig = loadConfigFile();
  const envConfig = resolveEnv();

  const apiKey = cliOptions.apiKey
    || envConfig.apiKey
    || fileConfig.apiKey
    || '';

  const model = cliOptions.model
    || envConfig.model
    || fileConfig.model
    || DEFAULT_MODELS.builder;

  const baseUrl = cliOptions.baseUrl
    || envConfig.baseUrl
    || fileConfig.baseUrl
    || '';

  const maxTokens = cliOptions.maxTokens
    || envConfig.maxTokens
    || fileConfig.maxTokens
    || 8192;

  const temperature = cliOptions.temperature ?? envConfig.temperature ?? fileConfig.temperature ?? 0.7;

  return { apiKey, model, baseUrl, maxTokens, temperature };
}

export function validateConfig(config: AgentRuntimeConfig): string[] {
  const errors: string[] = [];
  if (!config.apiKey) {
    errors.push(
      'No API key found. Set ANTHROPIC_API_KEY env var, pass --api-key, or add it to .idea-agent.json'
    );
  }
  if (!config.model) {
    errors.push('No model specified. Set MODEL env var or pass --model');
  }
  return errors;
}

export function printConfig(config: AgentRuntimeConfig): void {
  const mask = (key: string) => key.slice(0, 8) + '...' + key.slice(-4);
  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│  Configuration                          │');
  console.log('├─────────────────────────────────────────┤');
  console.log(`│  API Key:  ${mask(config.apiKey).padEnd(35)}│`);
  console.log(`│  Model:    ${config.model.padEnd(35)}│`);
  console.log(`│  Base URL: ${(config.baseUrl || '(default)').padEnd(35)}│`);
  console.log(`│  Max Tokens: ${String(config.maxTokens).padEnd(35)}│`);
  console.log(`│  Temperature: ${String(config.temperature).padEnd(34)}│`);
  console.log('└─────────────────────────────────────────┘');
  console.log('');
}
