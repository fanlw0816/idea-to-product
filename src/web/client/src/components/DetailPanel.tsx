import type { ObsEvent } from '../types/event';
import { getPhaseLabel, getRoleTextColor, getLocalizedRoleName, getRoleIcon } from '../utils/roleColors';
import {
  Activity,
  Users,
  BarChart3,
  FileCode,
  AlertTriangle,
  Wrench,
  ScrollText,
  Sparkles,
} from 'lucide-react';

interface DetailPanelProps {
  events: ObsEvent[];
  selectedEvent: ObsEvent | null;
}

export function DetailPanel({ events, selectedEvent }: DetailPanelProps) {
  // Compute current phase
  const phaseStarts = events.filter((e) => e.type === 'phase_start');
  const currentPhase = phaseStarts.length > 0
    ? phaseStarts[phaseStarts.length - 1].phase
    : null;

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

  // Find latest scoring
  const scoringEvent = events.find((e) => e.type === 'scoring');
  const scores = scoringEvent?.meta as Record<string, number> | undefined;

  // Find build phase files
  const builderSummary = events.find((e) => e.type === 'builder_summary' && e.phase === 'build');
  const fileList = builderSummary?.meta?.files as string[] | undefined;

  // Find errors and fixes
  const errorEvents = events.filter((e) => e.type === 'error');
  const reviewFixes = events.filter((e) => e.type === 'review_fix');

  return (
    <aside className="w-72 arena-panel flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-arena-border">
        <div className="flex items-center gap-2">
          <Activity className="icon-md text-arena-info" />
          <span className="text-sm font-semibold text-arena-text">Details</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Current Phase */}
        {currentPhase && (
          <section>
            <h3 className="text-xs font-medium text-arena-text-muted uppercase tracking-wide mb-2">
              Current Phase
            </h3>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-arena-elevated">
              <span className="text-sm font-medium text-arena-text">
                {getPhaseLabel(currentPhase)}
              </span>
            </div>
          </section>
        )}

        {/* Turn counter (idea phase) */}
        {currentPhase === 'idea' && (
          <section>
            <h3 className="text-xs font-medium text-arena-text-muted uppercase tracking-wide mb-2">
              Progress
            </h3>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-arena-elevated">
              <span className="text-sm text-arena-text-secondary">Turn</span>
              <span className="text-lg font-semibold text-arena-text">
                {currentTurn} <span className="text-arena-text-muted">/ 24</span>
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1 bg-arena-border rounded-full overflow-hidden">
              <div
                className="h-full bg-phase-idea transition-all duration-arena-normal"
                style={{ width: `${(currentTurn / 24) * 100}%` }}
              />
            </div>
          </section>
        )}

        {/* File list (build phase) */}
        {currentPhase === 'build' && fileList && fileList.length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-arena-text-muted uppercase tracking-wide mb-2 flex items-center gap-1">
              <FileCode className="icon-xs" />
              Generated Files
            </h3>
            <div className="bg-arena-elevated rounded-lg p-2 max-h-40 overflow-y-auto">
              {fileList.map((f, i) => (
                <div key={i} className="text-xs text-arena-text-secondary py-1 truncate">
                  {f}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Role participation */}
        {Object.keys(roleCounts).length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-arena-text-muted uppercase tracking-wide mb-2 flex items-center gap-1">
              <Users className="icon-xs" />
              Speaker Stats
            </h3>
            <div className="space-y-1">
              {Object.entries(roleCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([role, count]) => {
                  const RoleIcon = getRoleIcon(role);
                  const color = getRoleTextColor(role);
                  return (
                    <div
                      key={role}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-arena-elevated"
                    >
                      <div className="flex items-center gap-2">
                        <RoleIcon className="icon-xs" style={{ color }} />
                        <span className="text-xs font-medium" style={{ color }}>
                          {getLocalizedRoleName(role)}
                        </span>
                      </div>
                      <span className="text-xs text-arena-text-muted">{count}</span>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {/* Scores */}
        {scores && (
          <section>
            <h3 className="text-xs font-medium text-arena-text-muted uppercase tracking-wide mb-2 flex items-center gap-1">
              <BarChart3 className="icon-xs" />
              Scores
            </h3>
            <div className="bg-arena-elevated rounded-lg p-3">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(scores).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center">
                    <span className="text-xs text-arena-text-secondary">{key}</span>
                    <span className="text-sm font-semibold text-arena-warning">
                      {value}/10
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Errors */}
        {errorEvents.length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-arena-text-muted uppercase tracking-wide mb-2 flex items-center gap-1">
              <AlertTriangle className="icon-xs text-arena-error" />
              Errors ({errorEvents.length})
            </h3>
            <div className="bg-arena-error/10 rounded-lg p-2 max-h-24 overflow-y-auto border border-arena-error/30">
              {errorEvents.map((e, i) => (
                <div key={i} className="text-xs text-arena-error py-1 truncate">
                  {e.content}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Review fixes */}
        {reviewFixes.length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-arena-text-muted uppercase tracking-wide mb-2 flex items-center gap-1">
              <Wrench className="icon-xs text-arena-warning" />
              Fixes Applied ({reviewFixes.length})
            </h3>
            <div className="bg-arena-warning/10 rounded-lg p-2 max-h-24 overflow-y-auto border border-arena-warning/30">
              {reviewFixes.map((e, i) => (
                <div key={i} className="text-xs text-arena-warning py-1 truncate">
                  {e.content}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Selected event detail */}
        {selectedEvent && (
          <section className="border-t border-arena-border pt-4">
            <h3 className="text-xs font-medium text-arena-text-muted uppercase tracking-wide mb-2 flex items-center gap-1">
              <ScrollText className="icon-xs" />
              Selected Event
            </h3>
            <div className="bg-arena-elevated rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-arena-info font-medium">
                  {selectedEvent.type}
                </span>
                <span className="text-xs text-arena-text-muted">
                  {getLocalizedRoleName(selectedEvent.role)}
                </span>
              </div>
              <div className="text-sm text-arena-text-secondary whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                {selectedEvent.content}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Panel footer */}
      <div className="px-4 py-2 border-t border-arena-border text-xs text-arena-text-muted">
        Total: {events.length} events
      </div>
    </aside>
  );
}