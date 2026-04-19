// Shared types for Web UI — synced with EventBus ObsEvent

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
  | 'error'
  | 'stopped';  // User-initiated stop

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
  type: 'event' | 'control' | 'history' | 'export';
  data: ObsEvent | ObsEvent[] | ControlCommand;
}

export interface ControlCommand {
  action: 'pause' | 'resume' | 'clear' | 'export';
}

export interface ConnectionState {
  connected: boolean;
  url: string;
  reconnecting: boolean;
}