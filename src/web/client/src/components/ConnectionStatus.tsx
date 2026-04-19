interface ConnectionState {
  connected: boolean;
  reconnecting: boolean;
  paused: boolean;
  error?: string;
}

interface ArenaStatus {
  status: 'waiting' | 'running' | 'completed' | 'error';
  phase: string | null;
  turn: number;
  maxTurns: number;
}

interface ConnectionStatusProps {
  state: ConnectionState;
  arenaStatus: ArenaStatus;
}

const PHASE_LABELS: Record<string, string> = {
  idea: '💡 Idea Arena',
  design: '📐 Design',
  build: '🏗️ Build',
  review: '🔍 Review',
  deploy: '🚀 Deploy',
};

export function ConnectionStatus({ state, arenaStatus }: ConnectionStatusProps) {
  // Connection indicator
  const connColor = state.connected
    ? 'text-green-400'
    : state.reconnecting
    ? 'text-yellow-400'
    : 'text-red-400';

  const connText = state.connected
    ? '●'
    : state.reconnecting
    ? '◐'
    : '○';

  // Arena status indicator
  const arenaColor = arenaStatus.status === 'running'
    ? 'text-blue-400 animate-pulse'
    : arenaStatus.status === 'completed'
    ? 'text-green-400'
    : arenaStatus.status === 'error'
    ? 'text-red-400'
    : 'text-gray-400';

  const arenaText = arenaStatus.status === 'running'
    ? '⚡ Running'
    : arenaStatus.status === 'completed'
    ? '✓ Completed'
    : arenaStatus.status === 'error'
    ? '⚠ Error'
    : '○ Waiting';

  // Phase and turn info
  const phaseLabel = arenaStatus.phase ? PHASE_LABELS[arenaStatus.phase] || arenaStatus.phase : null;
  const turnInfo = arenaStatus.phase === 'idea' && arenaStatus.status === 'running'
    ? `Turn ${arenaStatus.turn}/${arenaStatus.maxTurns}`
    : null;

  return (
    <div className="flex items-center gap-3 text-xs">
      {/* Connection status */}
      <span className={connColor}>{connText}</span>

      {/* Arena status with animation */}
      <span className={`${arenaColor} font-medium`}>
        {arenaText}
      </span>

      {/* Phase indicator */}
      {phaseLabel && (
        <span className="text-gray-400 border-l border-gray-600 pl-2">
          {phaseLabel}
        </span>
      )}

      {/* Turn counter for idea phase */}
      {turnInfo && (
        <span className="text-yellow-400">
          {turnInfo}
        </span>
      )}

      {/* Paused indicator */}
      {state.paused && (
        <span className="text-orange-400 border-l border-gray-600 pl-2">
          ⏸ Paused
        </span>
      )}
    </div>
  );
}