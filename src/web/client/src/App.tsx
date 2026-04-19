import { useState, useCallback, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Timeline } from './components/Timeline';
import { DetailPanel } from './components/DetailPanel';
import { ControlBar } from './components/ControlBar';
import { ConnectionStatus } from './components/ConnectionStatus';
import type { ObsEvent } from './types/event';

const WS_URL = `ws://${window.location.host}/ws`;

export default function App() {
  const [events, setEvents] = useState<ObsEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ObsEvent | null>(null);

  const onEvent = useCallback((event: ObsEvent) => {
    setEvents((prev) => [...prev, event]);
  }, []);

  const onHistory = useCallback((history: ObsEvent[]) => {
    setEvents(history);
  }, []);

  const onExport = useCallback((exportedEvents: ObsEvent[]) => {
    // Trigger file download
    const blob = new Blob([JSON.stringify(exportedEvents, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arena-events-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const { state, sendControl } = useWebSocket({
    url: WS_URL,
    onEvent,
    onHistory,
    onExport,
  });

  // Compute arena status
  const arenaStatus = useMemo(() => {
    if (events.length === 0) return { status: 'waiting', phase: null, turn: 0, maxTurns: 24 };

    const phaseStarts = events.filter((e) => e.type === 'phase_start');
    const phaseEnds = events.filter((e) => e.type === 'phase_end');
    const currentPhase = phaseStarts.length > 0
      ? phaseStarts[phaseStarts.length - 1].phase
      : null;

    // Check if completed
    const deployEnd = phaseEnds.find((e) => e.phase === 'deploy');
    if (deployEnd) return { status: 'completed', phase: 'deploy', turn: 0, maxTurns: 24 };

    // Compute turn for idea phase
    const ideaEvents = events.filter((e) => e.phase === 'idea');
    const turnEvents = ideaEvents.filter((e) => e.type === 'role_speak' || e.type === 'role_pitch');
    const currentTurn = turnEvents.length;

    // Check for errors
    const hasError = events.some((e) => e.type === 'error');
    if (hasError) return { status: 'error', phase: currentPhase, turn: currentTurn, maxTurns: 24 };

    return { status: 'running', phase: currentPhase, turn: currentTurn, maxTurns: 24 };
  }, [events]);

  const handleClear = () => {
    setEvents([]);
    setSelectedEvent(null);
    sendControl('clear');
  };

  const handlePause = () => {
    sendControl('pause');
  };

  const handleResume = () => {
    sendControl('resume');
  };

  const handleStop = () => {
    sendControl('stop');
  };

  return (
    <div className="min-h-screen bg-arena-bg text-gray-100">
      {/* Header */}
      <header className="bg-arena-card border-b border-arena-border px-4 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Arena Web UI</h1>
          <ConnectionStatus state={state} arenaStatus={arenaStatus} />
        </div>
        <ControlBar
          onClear={handleClear}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onExport={() => sendControl('export')}
          connected={state.connected}
          paused={state.paused}
          arenaStatus={arenaStatus}
        />
      </header>

      {/* Main content */}
      <main className="flex h-[calc(100vh-80px)]">
        <Timeline
          events={events}
          onSelectEvent={setSelectedEvent}
          selectedEvent={selectedEvent}
        />
        <DetailPanel events={events} selectedEvent={selectedEvent} />
      </main>

      {/* Footer */}
      <footer className="bg-arena-card border-t border-arena-border px-4 py-1 text-xs text-gray-500">
        {events.length} events · Last update: {events.length > 0 ? new Date(events[events.length - 1].ts).toLocaleTimeString() : 'N/A'}
      </footer>
    </div>
  );
}