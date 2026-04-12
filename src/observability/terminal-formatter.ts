// ============================================================
// Terminal Formatter — real-time, colorful terminal output for
// every role and phase. Replaces ad-hoc console.log calls.
// ============================================================

import chalk from 'chalk';
import type { ObsEvent } from './event-bus.js';
import { EventBus } from './event-bus.js';

// ---- Color palette per role ----

const ROLE_COLORS: Record<string, (s: string) => string> = {
  TrendHunter: chalk.magentaBright,
  UserVoice: chalk.cyanBright,
  Engineer: chalk.greenBright,
  DevilAdvocate: chalk.redBright,
  Minimalist: chalk.yellowBright,
  Philosopher: chalk.blueBright,
  DESIGNER: chalk.hex('#a78bfa'),
  REVIEWER: chalk.hex('#fb923c'),
  DEPLOYER: chalk.hex('#34d399'),
  Orchestrator: chalk.whiteBright,
};

function getRoleColor(role: string): (s: string) => string {
  return ROLE_COLORS[role] ?? chalk.white;
}

// ---- Helpers ----

function header(text: string): string {
  const w = Math.max(text.length + 6, 50);
  const top = chalk.dim('╭' + '─'.repeat(w - 2) + '╮');
  const mid = chalk.bold(`  ${text}  `);
  const bot = chalk.dim('╰' + '─'.repeat(w - 2) + '╯');
  return `\n${top}\n${mid}\n${bot}\n`;
}

function divider(): string {
  return chalk.dim('├' + '─'.repeat(48) + '┤');
}

function blockStart(role: string, type: string): string {
  const color = getRoleColor(role);
  const icon = typeIcon(type);
  return `\n${chalk.dim('│')}  ${icon} ${color(chalk.bold(role))} ${chalk.dim(`[${type}]`)}`;
}

function blockEnd(): string {
  return chalk.dim('├') + chalk.dim('─'.repeat(48)) + chalk.dim('┤');
}

function typeIcon(type: string): string {
  switch (type) {
    case 'role_pitch': return '💡';
    case 'role_attack': return '⚔️';
    case 'role_defense': return '🛡️';
    case 'role_speak': return '🗣️';
    case 'moderator_summary': return '🎙️';
    case 'synthesis': return '🎯';
    case 'scoring': return '📊';
    case 'design_output': return '📐';
    case 'builder_output': return '🔨';
    case 'builder_summary': return '📋';
    case 'review_findings': return '🔍';
    case 'review_fix': return '🔧';
    case 'deploy_summary': return '🚀';
    case 'error': return '❌';
    default: return '·';
  }
}

function formatContent(content: string, width = 76): string {
  // Preserve line breaks but wrap very long lines
  return content
    .split('\n')
    .map((line) => {
      if (line.length <= width) return chalk.gray(line);
      const chunks: string[] = [];
      for (let i = 0; i < line.length; i += width) {
        chunks.push(line.slice(i, i + width));
      }
      return chalk.gray(chunks.join('\n'));
    })
    .join('\n');
}

// ---- Phase frames ----

function phaseStart(phase: string): string {
  const phaseIcons: Record<string, string> = {
    idea: '💭',
    design: '📐',
    build: '🏗️',
    review: '🔍',
    deploy: '🚀',
  };
  const icon = phaseIcons[phase] ?? '▶️';
  return header(`${icon}  PHASE: ${phase.toUpperCase()}`);
}

function phaseEnd(phase: string, stats: Record<string, string>): string {
  const lines = Object.entries(stats)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');
  return `\n${chalk.dim('╰' + '─'.repeat(Math.max(lines.length + 4, 50)) + '╯')}\n`;
}

// ---- Formatter ----

export class TerminalFormatter {
  /** Attach this formatter to an event bus and it renders every event. */
  static attachTo(bus: EventBus): void {
    bus.on((e) => TerminalFormatter.render(e));
  }

  static render(e: ObsEvent): void {
    switch (e.type) {
      case 'phase_start':
        console.log(phaseStart(e.role || e.phase));
        break;

      case 'phase_end': {
        const stats = e.meta as Record<string, string>;
        console.log(phaseEnd(e.phase, stats));
        break;
      }

      case 'role_pitch':
      case 'role_attack':
      case 'role_defense':
      case 'role_speak':
      case 'moderator_summary':
        console.log(blockStart(e.role, e.type.replace('role_', '').replace('moderator_summary', 'summary')));
        console.log(formatContent(e.content));
        console.log(blockEnd());
        break;

      case 'synthesis':
        console.log(`\n${chalk.dim('│')}  🎯 ${chalk.bold.whiteBright('SYNTHESIS')}`);
        console.log(formatContent(e.content));
        console.log(blockEnd());
        break;

      case 'scoring':
        console.log(`\n${chalk.dim('│')}  📊 ${chalk.bold.whiteBright('SCORING')}`);
        console.log(formatContent(e.content));
        console.log(blockEnd());
        break;

      case 'design_output':
        console.log(blockStart('DESIGNER', 'design'));
        console.log(formatContent(e.content));
        console.log(blockEnd());
        break;

      case 'builder_output':
        console.log(blockStart(e.role, 'builder'));
        console.log(formatContent(e.content));
        console.log(blockEnd());
        break;

      case 'builder_summary': {
        const s = e.meta;
        console.log(`\n${chalk.dim('│')}  📋 ${chalk.bold.whiteBright(`BUILDER: ${s.label}`)} ${s.fileCount} files`);
        console.log(blockEnd());
        break;
      }

      case 'review_findings':
        console.log(`\n${chalk.dim('│')}  🔍 ${chalk.bold.whiteBright('REVIEW')}`);
        console.log(formatContent(e.content));
        console.log(blockEnd());
        break;

      case 'review_fix':
        console.log(`\n${chalk.dim('│')}  🔧 ${chalk.bold.whiteBright(`FIXED: ${e.content}`)}`);
        break;

      case 'deploy_summary':
        console.log(`\n${chalk.dim('│')}  🚀 ${chalk.bold.whiteBright('DEPLOY')}`);
        console.log(formatContent(e.content));
        console.log(blockEnd());
        break;

      case 'error':
        console.log(`\n${chalk.dim('│')}  ❌ ${chalk.redBright.bold('ERROR')} ${e.role}`);
        console.log(chalk.red(e.content));
        console.log(blockEnd());
        break;
    }
  }
}
