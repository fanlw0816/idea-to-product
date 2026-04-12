import chalk from 'chalk';
import type { ChalkInstance } from 'chalk';

type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

function timestamp(): string {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

const levelColors: Record<LogLevel, ChalkInstance> = {
  info: chalk.cyan,
  success: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
  debug: chalk.gray,
};

function formatLevel(level: LogLevel): string {
  return levelColors[level](`[${level.toUpperCase()}]`);
}

function formatMessage(level: LogLevel, tag: string, message: string): string {
  const ts = chalk.dim(timestamp());
  const lvl = formatLevel(level);
  const t = tag ? chalk.bold(tag) : '';
  return `${ts} ${lvl} ${t} ${message}`;
}

export function log(level: LogLevel, tag: string, message: string, data?: unknown): void {
  if (level === 'debug' && !verbose) return;

  const formatted = formatMessage(level, tag, message);

  switch (level) {
    case 'info':
      console.log(formatted);
      break;
    case 'success':
      console.log(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
    case 'debug':
      console.debug(formatted);
      break;
  }

  if (data !== undefined) {
    if (verbose) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }
}

export function box(title: string): void {
  const width = Math.max(title.length + 4, 40);
  const border = chalk.dim('═'.repeat(width));
  const padded = chalk.bold(`  ${title}  `);
  console.log(`\n${border}`);
  console.log(border);
  console.log(`${border}\n`);
}

// Convenience wrappers
export const logger = {
  info: (tag: string, message: string, data?: unknown) => log('info', tag, message, data),
  success: (tag: string, message: string, data?: unknown) => log('success', tag, message, data),
  warn: (tag: string, message: string, data?: unknown) => log('warn', tag, message, data),
  error: (tag: string, message: string, data?: unknown) => log('error', tag, message, data),
  debug: (tag: string, message: string, data?: unknown) => log('debug', tag, message, data),
  box,
  setVerbose,
};
