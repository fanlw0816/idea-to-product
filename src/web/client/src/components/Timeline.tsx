import { useEffect, useRef } from 'react';
import type { ObsEvent } from '../types/event';
import { EventCard } from './EventCard';
import { getPhaseLabel } from '../utils/roleColors';

interface TimelineProps {
  events: ObsEvent[];
  onSelectEvent: (event: ObsEvent) => void;
  selectedEvent: ObsEvent | null;
}

export function Timeline({ events, onSelectEvent, selectedEvent }: TimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  // Group events by phase for separators
  let lastPhase = '';

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-4">
        📍 Event Timeline ({events.length} events)
      </div>

      {events.map((event, idx) => {
        const showPhaseSeparator = event.phase !== lastPhase && event.type === 'phase_start';
        lastPhase = event.phase;

        return (
          <div key={`${event.ts}-${idx}`}>
            {showPhaseSeparator && (
              <div className="flex items-center gap-2 my-4">
                <div className="flex-1 border-t border-arena-border" />
                <span className="text-xs text-gray-400 px-2">
                  {getPhaseLabel(event.phase)}
                </span>
                <div className="flex-1 border-t border-arena-border" />
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

      <div ref={bottomRef} className="text-center text-gray-500 py-4">
        {events.length === 0 ? 'Waiting for events...' : '↓'}
      </div>
    </div>
  );
}