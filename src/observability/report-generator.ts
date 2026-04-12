// ============================================================
// Report Generator — persistent Markdown reports for every
// pipeline run. Written to the state directory and also a
// final summary report.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import type { ObsEvent } from './event-bus.js';
import { EventBus } from './event-bus.js';

function escapeMarkdown(text: string): string {
  // Don't escape — the content IS markdown from the LLM
  return text;
}

function timestamp(time: string): string {
  try {
    return new Date(time).toLocaleString();
  } catch {
    return time;
  }
}

// ---- Report structure ----

interface PhaseSection {
  title: string;
  events: ObsEvent[];
}

function buildPhaseSections(events: ObsEvent[]): PhaseSection[] {
  const sections: PhaseSection[] = [];
  let current: PhaseSection | null = null;

  for (const e of events) {
    if (e.type === 'phase_start') {
      current = { title: e.role || e.phase, events: [e] };
      sections.push(current);
    } else if (current) {
      current.events.push(e);
    }
  }

  return sections;
}

function formatRoleBlock(e: ObsEvent): string {
  const icon = e.type === 'role_pitch' ? '💡'
    : e.type === 'role_attack' ? '⚔️'
    : e.type === 'moderator_summary' ? '🎙️'
    : e.type === 'synthesis' ? '🎯'
    : e.type === 'role_speak' ? '🗣️'
    : '·';

  return `### ${icon} **${e.role}** — ${e.type.replace('role_', '').replace('moderator_summary', 'summary')}\n\n${escapeMarkdown(e.content)}\n`;
}

function formatMetaBlock(e: ObsEvent): string {
  const keys = Object.keys(e.meta);
  if (keys.length === 0) return '';
  const pairs = keys.map((k) => `  - **${k}**: ${e.meta[k]}`).join('\n');
  return `\n**Details:**\n${pairs}\n`;
}

// ---- Generator ----

export class ReportGenerator {
  private bus: EventBus;
  private stateDir: string;

  constructor(bus: EventBus, stateDir: string) {
    this.bus = bus;
    this.stateDir = stateDir;
  }

  /** Generate the full pipeline report after all phases complete. */
  generateFullReport(): string {
    const events = this.bus.getHistory();
    const sections = buildPhaseSections(events);

    const lines: string[] = [
      '# Pipeline Run Report',
      '',
      `> Generated: ${new Date().toLocaleString()}`,
      '',
      '---',
      '',
    ];

    for (const section of sections) {
      lines.push(`## ${section.title}`, '');

      for (const e of section.events) {
        if (e.type.startsWith('role_') || e.type === 'moderator_summary') {
          lines.push(formatRoleBlock(e));
        } else if (e.type === 'synthesis' || e.type === 'scoring') {
          lines.push(`### ${e.type === 'synthesis' ? '🎯 Synthesis' : '📊 Scoring'}\n`, '');
          lines.push(escapeMarkdown(e.content), '');
          lines.push(formatMetaBlock(e));
        } else if (e.type === 'design_output') {
          lines.push('### 📐 Design Spec', '');
          lines.push('```json', '');
          lines.push(escapeMarkdown(e.content), '');
          lines.push('```', '');
        } else if (e.type === 'builder_output') {
          lines.push(`### 🔨 ${e.role}`, '');
          lines.push(escapeMarkdown(e.content), '');
          if (Object.keys(e.meta).length > 0) {
            lines.push(formatMetaBlock(e));
          }
        } else if (e.type === 'review_findings' || e.type === 'deploy_summary') {
          lines.push(`### ${e.type === 'review_findings' ? '🔍 Review' : '🚀 Deploy'}`, '');
          lines.push(escapeMarkdown(e.content), '');
        }
      }

      lines.push('---', '');
    }

    return lines.join('\n');
  }

  /** Write the report to disk. */
  save(): string {
    const report = this.generateFullReport();
    const runId = Date.now();
    const filePath = path.join(this.stateDir, `report-${runId}.md`);
    fs.writeFileSync(filePath, report, 'utf-8');
    return filePath;
  }

  /** Also save a structured JSON summary. */
  saveJsonSummary(): string {
    const events = this.bus.getHistory();
    const filePath = path.join(this.stateDir, 'events.json');
    fs.writeFileSync(filePath, JSON.stringify(events, null, 2), 'utf-8');
    return filePath;
  }
}
