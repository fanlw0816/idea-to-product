// Frontend event types — synced with backend shared/types.ts

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
  ts: number;
  time: string;
  type: EventType;
  phase: string;
  role: string;
  content: string;
  meta: Record<string, unknown>;
}

export interface WebSocketMessage {
  type: 'event' | 'history' | 'control' | 'export';
  data: ObsEvent | ObsEvent[];
}