// ============================================================
// Global configuration — reads from CLI > env > config file > defaults
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { t } from '../i18n/index.js';

export interface AgentRuntimeConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
  language: string;
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
    // Strip JSONC: first remove /* */ block comments, then strip "//" comment keys
    const cleaned = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s*"[\/]+".*$/gm, '');
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
  if (process.env.LANGUAGE) result.language = process.env.LANGUAGE;
  return result;
}

export function resolveConfig(cliOptions: {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  language?: string;
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

  const language = cliOptions.language
    || envConfig.language
    || fileConfig.language
    || 'en';

  return { apiKey, model, baseUrl, maxTokens, temperature, language };
}

export function validateConfig(config: AgentRuntimeConfig): string[] {
  const errors: string[] = [];
  if (!config.apiKey) {
    errors.push(t('config.errorNoApiKey'));
  }
  if (!config.model) {
    errors.push(t('config.errorNoModel'));
  }
  return errors;
}

export function printConfig(config: AgentRuntimeConfig): void {
  const mask = (key: string) => key.slice(0, 8) + '...' + key.slice(-4);
  const langLabel = config.language === 'zh' || config.language === 'zh-CN' || config.language === 'zh-CN' ? 'Chinese (中文)'
    : config.language === 'ja' ? 'Japanese (日本語)'
    : config.language === 'ko' ? 'Korean (한국어)'
    : config.language === 'en' ? 'English'
    : config.language;

  // Get translated labels
  const title = t('config.title');
  const apiKeyLabel = t('config.apiKey');
  const modelLabel = t('config.model');
  const baseUrlLabel = t('config.baseUrl');
  const maxTokensLabel = t('config.maxTokens');
  const temperatureLabel = t('config.temperature');
  const languageLabel = t('config.language');

  // Calculate padding based on longest label (Chinese labels are shorter)
  const padLen = 35;

  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log(`│  ${title.padEnd(39)}│`);
  console.log('├─────────────────────────────────────────┤');
  console.log(`│  ${apiKeyLabel}:  ${mask(config.apiKey).padEnd(padLen)}│`);
  console.log(`│  ${modelLabel}:    ${config.model.padEnd(padLen)}│`);
  console.log(`│  ${baseUrlLabel}: ${(config.baseUrl || '(default)').padEnd(padLen)}│`);
  console.log(`│  ${maxTokensLabel}: ${String(config.maxTokens).padEnd(padLen)}│`);
  console.log(`│  ${temperatureLabel}: ${String(config.temperature).padEnd(padLen)}│`);
  console.log(`│  ${languageLabel}:  ${langLabel.padEnd(padLen)}│`);
  console.log('└─────────────────────────────────────────┘');
  console.log('');
}
