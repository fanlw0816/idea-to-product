// ============================================================
// Event Bus — structured event recording for full observability
// Each phase and agent emits events that are consumed by the
// terminal formatter, report generator, and JSON store.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';

// ---- Event types ----

export type EventType =
  | 'phase_start'
  | 'phase_end'
  | 'role_pitch'
  | 'role_attack'
  | 'role_defense'
  | 'role_speak'
  | 'moderator_summary'
  | 'synthesis'
  | 'scoring'
  | 'design_output'
  | 'builder_output'
  | 'builder_summary'
  | 'review_findings'
  | 'review_fix'
  | 'deploy_summary'
  | 'error';

export interface ObsEvent {
  /** Monotonic timestamp ms */
  ts: number;
  /** ISO timestamp string */
  time: string;
  type: EventType;
  /** Pipeline phase: idea | design | build | review | deploy */
  phase: string;
  /** Agent/role identifier, e.g. "TrendHunter", "Designer" */
  role: string;
  /** Free text content */
  content: string;
  /** Structured metadata (scores, file counts, etc.) */
  meta: Record<string, unknown>;
}

// ---- Event Bus ----

export class EventBus {
  private events: ObsEvent[] = [];
  private listeners: Array<(e: ObsEvent) => void> = [];
  private storagePath: string;
  private wsBridge?: (e: ObsEvent) => void;

  constructor(stateDir: string) {
    this.storagePath = path.join(stateDir, 'events.jsonl');
    // Ensure directory exists
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Truncate previous run
    if (fs.existsSync(this.storagePath)) {
      fs.unlinkSync(this.storagePath);
    }
  }

  /** Emit a new event. Notifies all listeners and appends to JSONL. */
  emit(e: Omit<ObsEvent, 'ts' | 'time'>): void {
    const event: ObsEvent = {
      ...e,
      ts: Date.now(),
      time: new Date().toISOString(),
    };
    this.events.push(event);
    for (const fn of this.listeners) {
      try { fn(event); } catch { /* ignore listener errors */ }
    }
    // Append to JSONL (one event per line)
    fs.appendFileSync(this.storagePath, JSON.stringify(event) + '\n');
    // Bridge to WebSocket if set
    if (this.wsBridge) {
      this.wsBridge(event);
    }
  }

  /** Register a listener that fires on every event. */
  on(fn: (e: ObsEvent) => void): void {
    this.listeners.push(fn);
  }

  /** Set WebSocket bridge for real-time broadcast. */
  setWsBridge(fn: (e: ObsEvent) => void): void {
    this.wsBridge = fn;
  }

  /** All events so far. */
  getHistory(): ObsEvent[] {
    return [...this.events];
  }

  /** Events for a specific phase. */
  getByPhase(phase: string): ObsEvent[] {
    return this.events.filter((e) => e.phase === phase);
  }

  /** Events for a specific role. */
  getByRole(role: string): ObsEvent[] {
    return this.events.filter((e) => e.role === role);
  }

  /** Load events back from JSONL (survive restarts). */
  loadFromFile(): ObsEvent[] {
    if (!fs.existsSync(this.storagePath)) return [];
    const lines = fs.readFileSync(this.storagePath, 'utf-8')
      .split('\n')
      .filter(Boolean);
    this.events = lines.map((l) => JSON.parse(l) as ObsEvent);
    return this.events;
  }
}
