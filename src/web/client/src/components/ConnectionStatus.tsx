import { Wifi, WifiOff, Loader2, CheckCircle, AlertTriangle, Circle, Square } from 'lucide-react';

interface ConnectionState {
  connected: boolean;
  reconnecting: boolean;
  paused: boolean;
  error?: string;
}

interface ArenaStatus {
  status: 'waiting' | 'running' | 'completed' | 'error' | 'stopped';
  phase: string | null;
  turn: number;
  maxTurns: number;
}

interface ConnectionStatusProps {
  state: ConnectionState;
  arenaStatus: ArenaStatus;
}

const PHASE_COLORS: Record<string, string> = {
  idea: 'text-phase-idea',
  design: 'text-phase-design',
  build: 'text-phase-build',
  review: 'text-phase-review',
  deploy: 'text-phase-deploy',
};

export function ConnectionStatus({ state, arenaStatus }: ConnectionStatusProps) {
  // Connection indicator
  const ConnIcon = state.connected
    ? Wifi
    : state.reconnecting
    ? Loader2
    : WifiOff;

  const connColor = state.connected
    ? 'text-arena-success'
    : state.reconnecting
    ? 'text-arena-warning'
    : 'text-arena-error';

  // Arena status indicator
  const StatusIcon = arenaStatus.status === 'running'
    ? Loader2
    : arenaStatus.status === 'completed'
    ? CheckCircle
    : arenaStatus.status === 'error'
    ? AlertTriangle
    : arenaStatus.status === 'stopped'
    ? Square
    : Circle;

  const statusColor = arenaStatus.status === 'running'
    ? 'text-arena-info'
    : arenaStatus.status === 'completed'
    ? 'text-arena-success'
    : arenaStatus.status === 'error'
    ? 'text-arena-error'
    : arenaStatus.status === 'stopped'
    ? 'text-arena-warning'
    : 'text-arena-text-muted';

  const statusText = arenaStatus.status === 'running'
    ? 'Running'
    : arenaStatus.status === 'completed'
    ? 'Completed'
    : arenaStatus.status === 'error'
    ? 'Error'
    : arenaStatus.status === 'stopped'
    ? 'Stopped'
    : 'Waiting';

  return (
    <div className="flex items-center gap-3">
      {/* Connection status */}
      <div className={`flex items-center gap-1.5 ${connColor}`}>
        <ConnIcon className={`icon-sm ${state.reconnecting ? 'animate-spin' : ''}`} />
        <span className="text-xs font-medium hidden sm:inline">
          {state.connected ? 'Connected' : state.reconnecting ? 'Reconnecting' : 'Offline'}
        </span>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-arena-border" />

      {/* Arena status */}
      <div className={`flex items-center gap-1.5 ${statusColor}`}>
        <StatusIcon className={`icon-sm ${arenaStatus.status === 'running' ? 'animate-spin' : ''}`} />
        <span className="text-xs font-medium">{statusText}</span>
      </div>

      {/* Paused indicator */}
      {state.paused && (
        <>
          <div className="h-4 w-px bg-arena-border" />
          <span className="arena-badge arena-badge-warning">
            Paused
          </span>
        </>
      )}
    </div>
  );
}