import { useMemo } from 'react';
import { Sparkles, Palette, Hammer, Search, Rocket, MessageCircle } from 'lucide-react';
import { getPhaseIcon, getPhaseLabel } from '../utils/roleColors';

interface ArenaStatus {
  status: 'waiting' | 'running' | 'completed' | 'error' | 'stopped';
  phase: string | null;
  turn: number;
  maxTurns: number;
}

interface HeaderStatsProps {
  events: any[];
  arenaStatus: ArenaStatus;
}

export function HeaderStats({ events, arenaStatus }: HeaderStatsProps) {
  // Compute stats
  const stats = useMemo(() => {
    const roleEvents = events.filter((e: any) => e.type.startsWith('role_'));
    const roleCounts: Record<string, number> = {};
    for (const e of roleEvents) {
      roleCounts[e.role] = (roleCounts[e.role] || 0) + 1;
    }
    return {
      roleCount: Object.keys(roleCounts).length,
      totalMessages: roleEvents.length,
      currentPhase: arenaStatus.phase,
      turn: arenaStatus.turn,
      maxTurns: arenaStatus.maxTurns,
    };
  }, [events, arenaStatus]);

  const PhaseIcon = getPhaseIcon(stats.currentPhase || 'idea');

  return (
    <div className="flex items-center gap-4 text-xs">
      {/* Current phase */}
      {stats.currentPhase && (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-arena-elevated">
          <PhaseIcon className="icon-sm text-arena-info" />
          <span className="text-arena-text-secondary font-medium">
            {getPhaseLabel(stats.currentPhase)}
          </span>
        </div>
      )}

      {/* Turn counter (idea phase only) */}
      {stats.currentPhase === 'idea' && arenaStatus.status === 'running' && (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-phase-idea/20">
          <MessageCircle className="icon-sm text-phase-idea" />
          <span className="text-arena-text font-medium">
            {stats.turn}/{stats.maxTurns}
          </span>
        </div>
      )}

      {/* Message count */}
      {stats.totalMessages > 0 && (
        <div className="flex items-center gap-2 text-arena-text-muted">
          <MessageCircle className="icon-sm" />
          <span>{stats.totalMessages} messages</span>
        </div>
      )}
    </div>
  );
}