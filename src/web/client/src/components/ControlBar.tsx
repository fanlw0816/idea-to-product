interface ControlBarProps {
  onClear: () => void;
  onPause: () => void;
  onResume: () => void;
  onExport: () => void;
  connected: boolean;
  paused: boolean;
}

export function ControlBar({ onClear, onPause, onResume, onExport, connected, paused }: ControlBarProps) {
  return (
    <div className="flex gap-2 mt-2">
      <button
        onClick={paused ? onResume : onPause}
        disabled={!connected}
        className={`px-3 py-1 text-xs rounded ${paused ? 'bg-yellow-600' : 'bg-arena-border'} hover:bg-gray-600 disabled:opacity-50`}
      >
        {paused ? '▶️ Resume' : '⏸️ Pause'}
      </button>
      <button
        onClick={onClear}
        disabled={!connected}
        className="px-3 py-1 text-xs rounded bg-arena-border hover:bg-gray-600 disabled:opacity-50"
      >
        🗑️ Clear
      </button>
      <button
        onClick={onExport}
        disabled={!connected}
        className="px-3 py-1 text-xs rounded bg-arena-border hover:bg-gray-600 disabled:opacity-50"
      >
        📥 Export
      </button>
    </div>
  );
}