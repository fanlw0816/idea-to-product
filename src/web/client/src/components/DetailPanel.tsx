import type { ObsEvent } from '../types/event';
import { getPhaseLabel, getRoleTextColor, getLocalizedRoleName } from '../utils/roleColors';

interface DetailPanelProps {
  events: ObsEvent[];
  selectedEvent: ObsEvent | null;
}

export function DetailPanel({ events, selectedEvent }: DetailPanelProps) {
  // Compute current phase
  const phaseStarts = events.filter((e) => e.type === 'phase_start');
  const currentPhase = phaseStarts.length > 0
    ? phaseStarts[phaseStarts.length - 1].phase
    : 'N/A';

  // Compute role counts
  const roleCounts: Record<string, number> = {};
  for (const e of events) {
    if (e.type.startsWith('role_')) {
      roleCounts[e.role] = (roleCounts[e.role] || 0) + 1;
    }
  }

  // Find current turn (idea phase)
  const ideaEvents = events.filter((e) => e.phase === 'idea');
  const turnEvents = ideaEvents.filter((e) => e.type === 'role_speak' || e.type === 'role_pitch');
  const currentTurn = turnEvents.length;
  const maxTurns = 24;

  // Find latest scoring
  const scoringEvent = events.find((e) => e.type === 'scoring');
  const scores = scoringEvent?.meta as Record<string, number> | undefined;

  // Find build phase files
  const builderSummary = events.find((e) => e.type === 'builder_summary' && e.phase === 'build');
  const fileList = builderSummary?.meta?.files as string[] | undefined;

  // Find errors
  const errorEvents = events.filter((e) => e.type === 'error');
  const reviewFixes = events.filter((e) => e.type === 'review_fix');

  return (
    <div className="w-72 bg-arena-card border-l border-arena-border p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-4">
        📊 Phase Details
      </div>

      {/* Current Phase */}
      <div className="mb-4">
        <div className="text-xs text-gray-500">Current Phase</div>
        <div className="text-lg font-semibold">{getPhaseLabel(currentPhase)}</div>
      </div>

      {/* Turn counter (idea phase only) */}
      {currentPhase === 'idea' && (
        <div className="mb-4">
          <div className="text-xs text-gray-500">Turn</div>
          <div className="text-lg font-semibold">{currentTurn} / {maxTurns}</div>
        </div>
      )}

      {/* File list (build phase only) */}
      {currentPhase === 'build' && fileList && fileList.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2">Generated Files</div>
          <div className="bg-arena-border rounded p-2 max-h-32 overflow-y-auto">
            {fileList.map((f, i) => (
              <div key={i} className="text-xs text-gray-300 truncate">{f}</div>
            ))}
          </div>
        </div>
      )}

      {/* Role counts */}
      {Object.keys(roleCounts).length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2">Speaker Stats</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(roleCounts).map(([role, count]) => (
              <span
                key={role}
                className="px-2 py-1 rounded text-xs"
                style={{
                  backgroundColor: getRoleTextColor(role) + '33',
                  color: getRoleTextColor(role),
                }}
              >
                {getLocalizedRoleName(role)}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Scores */}
      {scores && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2">Scores</div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {Object.entries(scores).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-400">{key}</span>
                <span className="text-white">{value}/10</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error summary */}
      {errorEvents.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2">⚠️ Errors ({errorEvents.length})</div>
          <div className="bg-red-900/30 rounded p-2 max-h-24 overflow-y-auto">
            {errorEvents.map((e, i) => (
              <div key={i} className="text-xs text-red-300 truncate">{e.content}</div>
            ))}
          </div>
        </div>
      )}

      {/* Review fixes */}
      {reviewFixes.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2">🔧 Fixes Applied ({reviewFixes.length})</div>
          <div className="bg-orange-900/30 rounded p-2 max-h-24 overflow-y-auto">
            {reviewFixes.map((e, i) => (
              <div key={i} className="text-xs text-orange-300 truncate">{e.content}</div>
            ))}
          </div>
        </div>
      )}

      {/* Selected event detail */}
      {selectedEvent && (
        <div className="mt-6 border-t border-arena-border pt-4">
          <div className="text-xs text-gray-500 mb-2">Selected Event</div>
          <div className="bg-arena-border rounded p-2">
            <div className="text-xs text-gray-400">
              {selectedEvent.type} · {getLocalizedRoleName(selectedEvent.role)}
            </div>
            <div className="text-sm text-gray-300 mt-1 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {selectedEvent.content}
            </div>
          </div>
        </div>
      )}

      {/* Total events */}
      <div className="mt-4 text-xs text-gray-500">
        Total events: {events.length}
      </div>
    </div>
  );
}