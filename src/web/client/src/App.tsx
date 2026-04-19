import { useState, useCallback, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Timeline } from './components/Timeline';
import { DetailPanel } from './components/DetailPanel';
import { ControlBar } from './components/ControlBar';
import { ConnectionStatus } from './components/ConnectionStatus';
import { HeaderStats } from './components/HeaderStats';
import type { ObsEvent } from './types/event';
import { Bot } from 'lucide-react';

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

    // Check if stopped by user
    const stoppedEvent = events.find((e) => e.type === 'stopped');
    if (stoppedEvent) return { status: 'stopped', phase: null, turn: 0, maxTurns: 24 };

    const phaseStarts = events.filter((e) => e.type === 'phase_start');
    const phaseEnds = events.filter((e) => e.type === 'phase_end');
    const currentPhase = phaseStarts.length > 0
      ? phaseStarts[phaseStarts.length - 1].phase
      : null;

    const deployEnd = phaseEnds.find((e) => e.phase === 'deploy');
    if (deployEnd) return { status: 'completed', phase: 'deploy', turn: 0, maxTurns: 24 };

    const ideaEvents = events.filter((e) => e.phase === 'idea');
    const turnEvents = ideaEvents.filter((e) => e.type === 'role_speak' || e.type === 'role_pitch');
    const currentTurn = turnEvents.length;

    const hasError = events.some((e) => e.type === 'error');
    if (hasError) return { status: 'error', phase: currentPhase, turn: currentTurn, maxTurns: 24 };

    return { status: 'running', phase: currentPhase, turn: currentTurn, maxTurns: 24 };
  }, [events]);

  const handleClear = () => {
    setEvents([]);
    setSelectedEvent(null);
    sendControl('clear');
  };

  const handlePause = () => sendControl('pause');
  const handleResume = () => sendControl('resume');
  const handleStop = () => sendControl('stop');

  return (
    <div className="min-h-screen bg-arena-bg flex flex-col">
      {/* Header - fixed top bar */}
      <header className="arena-header sticky top-0 z-50 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          {/* Logo and title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-arena-info">
              <Bot className="icon-md text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-arena-text">Arena Web UI</h1>
              <p className="text-xs text-arena-text-muted">Creative Arena Real-time Monitor</p>
            </div>
          </div>

          {/* Status indicators */}
          <ConnectionStatus state={state} arenaStatus={arenaStatus} />
        </div>

        {/* Control bar and stats */}
        <div className="flex items-center justify-between gap-4">
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
          <HeaderStats events={events} arenaStatus={arenaStatus} />
        </div>
      </header>

      {/* Main content - split layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Timeline (flexible width) */}
        <Timeline
          events={events}
          onSelectEvent={setSelectedEvent}
          selectedEvent={selectedEvent}
        />

        {/* Right: Detail panel (fixed width) */}
        <DetailPanel events={events} selectedEvent={selectedEvent} />
      </main>

      {/* Footer - minimal status bar */}
      <footer className="arena-footer px-4 py-2 flex items-center justify-between text-xs text-arena-text-muted">
        <div className="flex items-center gap-4">
          <span>{events.length} events</span>
          {events.length > 0 && (
            <span>Last: {new Date(events[events.length - 1].ts).toLocaleTimeString()}</span>
          )}
        </div>
        <div className="text-arena-text-secondary">
          WebSocket: {state.connected ? 'Connected' : 'Disconnected'}
        </div>
      </footer>
    </div>
  );
}