import {
  Pause,
  Play,
  Square,
  Trash2,
  Download,
} from 'lucide-react';

interface ArenaStatus {
  status: 'waiting' | 'running' | 'completed' | 'error' | 'stopped';
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

export function ControlBar({
  onClear,
  onPause,
  onResume,
  onStop,
  onExport,
  connected,
  paused,
  arenaStatus,
}: ControlBarProps) {
  const isRunning = arenaStatus.status === 'running';
  const isCompleted = arenaStatus.status === 'completed' || arenaStatus.status === 'stopped';

  return (
    <div className="flex items-center gap-2">
      {/* Pause/Resume */}
      <button
        onClick={paused ? onResume : onPause}
        disabled={!connected || isCompleted}
        className={`arena-btn ${
          paused ? 'arena-btn-warning' : 'arena-btn-secondary'
        }`}
        title={paused ? 'Resume' : 'Pause'}
      >
        {paused ? (
          <Play className="icon-sm" />
        ) : (
          <Pause className="icon-sm" />
        )}
        <span className="hidden sm:inline">{paused ? 'Resume' : 'Pause'}</span>
      </button>

      {/* Stop (only when running) */}
      {isRunning && !paused && onStop && (
        <button
          onClick={onStop}
          disabled={!connected}
          className="arena-btn arena-btn-danger"
          title="Stop"
        >
          <Square className="icon-sm" />
          <span className="hidden sm:inline">Stop</span>
        </button>
      )}

      {/* Clear */}
      <button
        onClick={onClear}
        disabled={!connected}
        className="arena-btn arena-btn-secondary"
        title="Clear"
      >
        <Trash2 className="icon-sm" />
        <span className="hidden sm:inline">Clear</span>
      </button>

      {/* Export */}
      <button
        onClick={onExport}
        disabled={!connected}
        className="arena-btn arena-btn-secondary"
        title="Export"
      >
        <Download className="icon-sm" />
        <span className="hidden sm:inline">Export</span>
      </button>

      {/* Status badge */}
      {arenaStatus.status === 'running' && !paused && (
        <span className="arena-badge arena-badge-info animate-pulse-custom">
          Processing
        </span>
      )}
      {arenaStatus.status === 'stopped' && (
        <span className="arena-badge arena-badge-warning">
          Stopped
        </span>
      )}
    </div>
  );
}