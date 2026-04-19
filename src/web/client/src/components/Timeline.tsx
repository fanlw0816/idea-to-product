import { useEffect, useRef } from 'react';
import type { ObsEvent } from '../types/event';
import { EventCard } from './EventCard';
import { getPhaseLabel, getPhaseIcon } from '../utils/roleColors';
import { List, Sparkles } from 'lucide-react';

interface TimelineProps {
  events: ObsEvent[];
  onSelectEvent: (event: ObsEvent) => void;
  selectedEvent: ObsEvent | null;
}

export function Timeline({ events, onSelectEvent, selectedEvent }: TimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (events.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events.length]);

  // Group events by phase for separators
  let lastPhase = '';

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6 sticky top-0 bg-arena-bg py-2 z-10">
        <List className="icon-md text-arena-info" />
        <span className="text-sm font-semibold text-arena-text">Event Timeline</span>
        <span className="text-xs text-arena-text-muted ml-2">
          {events.length} events
        </span>
      </div>

      {/* Events list */}
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-arena-text-muted">
          <Sparkles className="icon-lg mb-3 animate-pulse-custom" />
          <p className="text-sm">Waiting for events...</p>
          <p className="text-xs mt-1">Start the arena to see real-time updates</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event, idx) => {
            const showPhaseSeparator = event.phase !== lastPhase && event.type === 'phase_start';
            lastPhase = event.phase;

            return (
              <div key={`${event.ts}-${idx}`}>
                {showPhaseSeparator && (
                  <div className="phase-separator">
                    <div className="phase-separator-line" />
                    <span className="phase-separator-label">
                      {getPhaseLabel(event.phase)}
                    </span>
                    <div className="phase-separator-line" />
                  </div>
                )}
                <EventCard
                  event={event}
                  selected={selectedEvent === event}
                  onClick={() => onSelectEvent(event)}
                />
              </div>
            );
          })}
          <div ref={bottomRef} className="h-4" />
        </div>
      )}
    </div>
  );
}