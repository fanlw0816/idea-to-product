interface ArenaStatus {
  status: 'waiting' | 'running' | 'completed' | 'error';
  phase: string | null;
  turn: number;
  maxTurns: number;
}

interface ControlBarProps {
  onClear: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop?: () => void;
  onExport: () => void;
  connected: boolean;
  paused: boolean;
  arenaStatus: ArenaStatus;
}

export function ControlBar({ onClear, onPause, onResume, onStop, onExport, connected, paused, arenaStatus }: ControlBarProps) {
  const isRunning = arenaStatus.status === 'running';
  const isCompleted = arenaStatus.status === 'completed';

  return (
    <div className="flex gap-2 mt-2 items-center">
      {/* Pause/Resume */}
      <button
        onClick={paused ? onResume : onPause}
        disabled={!connected || isCompleted}
        className={`px-3 py-1 text-xs rounded transition-colors ${paused ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-arena-border hover:bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {paused ? '▶ Resume' : '⏸ Pause'}
      </button>

      {/* Stop (only when running) */}
      {isRunning && !paused && (
        <button
          onClick={onStop}
          disabled={!connected}
          className="px-3 py-1 text-xs rounded bg-red-700 hover:bg-red-600 transition-colors disabled:opacity-50"
        >
          ⏹ Stop
        </button>
      )}

      {/* Clear */}
      <button
        onClick={onClear}
        disabled={!connected}
        className="px-3 py-1 text-xs rounded bg-arena-border hover:bg-gray-600 transition-colors disabled:opacity-50"
      >
        🗑 Clear
      </button>

      {/* Export */}
      <button
        onClick={onExport}
        disabled={!connected}
        className="px-3 py-1 text-xs rounded bg-arena-border hover:bg-gray-600 transition-colors disabled:opacity-50"
      >
        📥 Export
      </button>

      {/* Status badge */}
      {isRunning && !paused && (
        <span className="ml-2 px-2 py-0.5 text-xs rounded bg-blue-900/50 text-blue-300 animate-pulse">
          Processing...
        </span>
      )}
    </div>
  );
}