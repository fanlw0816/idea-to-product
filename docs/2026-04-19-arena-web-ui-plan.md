# Arena Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Web UI for real-time visualization of the idea-to-product pipeline event stream.

**Architecture:** WebSocket server bridges EventBus events to React frontend. Dual-panel layout with streaming timeline (left) and phase detail panel (right).

**Tech Stack:** Express + ws (backend), React + Vite + Tailwind CSS (frontend), TypeScript throughout

---

## File Structure

```
src/web/
├── server/
│   ├── index.ts           # Express + WebSocket server entry
│   └── event-bridge.ts    # EventBus → WebSocket bridge
├── client/
│   ├── package.json       # Frontend dependencies (React, Vite, Tailwind)
│   ├── vite.config.ts     # Vite config with proxy to ws server
│   ├── tailwind.config.js # Tailwind with role color theme
│   ├── postcss.config.js  # PostCSS for Tailwind
│   ├── index.html         # Entry HTML
│   └── src/
│   │   ├── main.tsx       # React entry point
│   │   ├── App.tsx        # Main app component
│   │   ├── components/
│   │   │   ├── Timeline.tsx     # Event stream display
│   │   │   ├── EventCard.tsx    # Single event card
│   │   │   ├── DetailPanel.tsx  # Right panel with stats
│   │   │   ├── ControlBar.tsx   # Pause/clear/export buttons
│   │   │   └── ConnectionStatus.tsx # WebSocket status indicator
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts  # WebSocket connection hook
│   │   ├── types/
│   │   │   └── event.ts         # ObsEvent type definitions
│   │   └── styles/
│   │   │   └── index.css        # Tailwind imports + custom styles
│   │   └── utils/
│   │   │   └── roleColors.ts    # Role color mapping
└── shared/
    └── types.ts           # Shared type definitions (synced with EventBus)
```

**Modified files:**
- `src/observability/event-bus.ts` — Add wsBridge setter
- `src/cli.ts` — Add --web and --port options
- `src/core/orchestrator.ts` — Pass eventBus to web server
- `package.json` — Add ws, express dependencies

---

## Phase 1: WebSocket Server + Basic Frontend

### Task 1: Add Backend Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add ws and express dependencies**

Run: `cd d:/01coding/00projects/github/idea-to-product && npm install express ws @types/express @types/ws --save`

Expected: Dependencies added to package.json

- [ ] **Step 2: Verify installation**

Run: `npm list express ws`

Expected: `express@4.x` and `ws@8.x` listed

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add express and ws dependencies for web UI"
```

---

### Task 2: Create Shared Types

**Files:**
- Create: `src/web/shared/types.ts`

- [ ] **Step 1: Create shared types file**

Create `src/web/shared/types.ts`:

```typescript
// Shared types for Web UI — synced with EventBus ObsEvent

export type EventType =
  | 'phase_start'
  | 'phase_end'
  | 'role_pitch'
  | 'role_attack'
  | 'role_defense'
  | 'role_speak'
  | 'moderator_summary'
  | 'synthesis'
  | 'scoring'
  | 'design_output'
  | 'builder_output'
  | 'builder_summary'
  | 'review_findings'
  | 'review_fix'
  | 'deploy_summary'
  | 'error';

export interface ObsEvent {
  ts: number;
  time: string;
  type: EventType;
  phase: string;
  role: string;
  content: string;
  meta: Record<string, unknown>;
}

export interface WebSocketMessage {
  type: 'event' | 'control' | 'history' | 'export';
  data: ObsEvent | ObsEvent[] | ControlCommand;
}

export interface ControlCommand {
  action: 'pause' | 'resume' | 'clear' | 'export';
}

export interface ConnectionState {
  connected: boolean;
  url: string;
  reconnecting: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/shared/types.ts
git commit -m "feat(web): add shared types for WebSocket communication"
```

---

### Task 3: Create Event Bridge

**Files:**
- Create: `src/web/server/event-bridge.ts`

- [ ] **Step 1: Create event bridge module**

Create `src/web/server/event-bridge.ts`:

```typescript
import type WebSocket from 'ws';
import type { ObsEvent } from '../shared/types.js';

export class EventBridge {
  private clients: Set<WebSocket> = new Set();
  private paused = false;
  private pausedEvents: ObsEvent[] = [];
  private history: ObsEvent[] = [];  // Store all events for export

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
  }

  broadcast(event: ObsEvent): void {
    this.history.push(event);  // Record all events
    if (this.paused) {
      this.pausedEvents.push(event);
      return;
    }
    const message = JSON.stringify({ type: 'event', data: event });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  sendHistory(ws: WebSocket, events: ObsEvent[]): void {
    const message = JSON.stringify({ type: 'history', data: events });
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }

  handleControl(action: 'pause' | 'resume' | 'clear' | 'export', ws?: WebSocket): ObsEvent[] | null {
    switch (action) {
      case 'pause':
        this.paused = true;
        return null;
      case 'resume':
        this.paused = false;
        const events = [...this.pausedEvents];
        this.pausedEvents = [];
        return events;
      case 'clear':
        this.clearHistory();
        return null;
      case 'export':
        // Send all events back to client for download
        if (ws && ws.readyState === WebSocket.OPEN) {
          const allEvents = this.getAllEvents();
          ws.send(JSON.stringify({ type: 'export', data: allEvents }));
        }
        return null;
      default:
        return null;
    }
  }

  getAllEvents(): ObsEvent[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
    this.pausedEvents = [];
  }

  isPaused(): boolean {
    return this.paused;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/server/event-bridge.ts
git commit -m "feat(web): add EventBridge for EventBus → WebSocket routing"
```

---

### Task 4: Create WebSocket Server

**Files:**
- Create: `src/web/server/index.ts`

- [ ] **Step 1: Create WebSocket server entry**

Create `src/web/server/index.ts`:

```typescript
import express from 'express';
import { createServer } from 'http';
import WebSocket from 'ws';
import path from 'path';
import { EventBridge } from './event-bridge.js';
import type { EventBus } from '../../observability/event-bus.js';
import type { ObsEvent } from '../shared/types.js';

export interface WebServerConfig {
  port: number;
  eventBus: EventBus;
  clientDir?: string;
}

export class WebServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocket.Server;
  private bridge: EventBridge;
  private port: number;
  private eventBus: EventBus;

  constructor(config: WebServerConfig) {
    this.port = config.port;
    this.eventBus = config.eventBus;
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.bridge = new EventBridge();

    this.setupRoutes(config.clientDir);
    this.setupWebSocket();
    this.bridgeToEventBus();
  }

  private setupRoutes(clientDir?: string): void {
    const staticDir = clientDir || path.join(__dirname, '../client/dist');
    this.app.use(express.static(staticDir));
    
    // SPA fallback
    this.app.get('*', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      this.bridge.addClient(ws);
      
      // Send existing history
      const history = this.eventBus.getHistory();
      this.bridge.sendHistory(ws, history);

      // Handle control commands
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'control') {
            const result = this.bridge.handleControl(msg.data.action, ws);
            if (result && result.length > 0) {
              // Send resumed events
              for (const event of result) {
                ws.send(JSON.stringify({ type: 'event', data: event }));
              }
            }
          }
        } catch {
          // Ignore malformed messages
        }
      });
    });
  }

  private bridgeToEventBus(): void {
    this.eventBus.setWsBridge((event: ObsEvent) => {
      this.bridge.broadcast(event);
    });
  }

  start(): Promise<string> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        resolve(`http://localhost:${this.port}`);
      });
    });
  }

  stop(): void {
    this.wss.close();
    this.server.close();
  }
}

export async function startWebServer(config: WebServerConfig): Promise<WebServer> {
  const server = new WebServer(config);
  await server.start();
  return server;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/server/index.ts
git commit -m "feat(web): add WebSocket server with EventBus bridge"
```

---

### Task 5: Extend EventBus with wsBridge

**Files:**
- Modify: `src/observability/event-bus.ts`

- [ ] **Step 1: Add wsBridge property and setter**

Edit `src/observability/event-bus.ts`:

Find line 48 (inside class EventBus, after `private storagePath`), add:

```typescript
  private wsBridge?: (e: ObsEvent) => void;
```

Find line 83 (after `on` method), add:

```typescript
  /** Set WebSocket bridge for real-time broadcast. */
  setWsBridge(fn: (e: ObsEvent) => void): void {
    this.wsBridge = fn;
  }
```

Find line 68-79 (the emit method), add at end before closing brace:

```typescript
    // Bridge to WebSocket if set
    if (this.wsBridge) {
      this.wsBridge(event);
    }
```

- [ ] **Step 2: Verify the changes compile**

Run: `npm run build`

Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/observability/event-bus.ts
git commit -m "feat(observability): add wsBridge setter for WebSocket broadcast"
```

---

### Task 6: Create Frontend Project Scaffold

**Files:**
- Create: `src/web/client/package.json`
- Create: `src/web/client/vite.config.ts`
- Create: `src/web/client/index.html`
- Create: `src/web/client/src/main.tsx`

- [ ] **Step 1: Create frontend package.json**

Create `src/web/client/package.json`:

```json
{
  "name": "arena-web-client",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.3",
    "vite": "^6.0.5"
  }
}
```

- [ ] **Step 2: Install frontend dependencies**

Run: `cd src/web/client && npm install`

Expected: Dependencies installed

- [ ] **Step 3: Create vite.config.ts**

Create `src/web/client/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 4: Create index.html**

Create `src/web/client/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Arena Web UI — Idea-to-Product Stream</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create main.tsx**

Create `src/web/client/src/main.tsx`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 6: Commit**

```bash
git add src/web/client/
git commit -m "feat(web): scaffold React + Vite frontend project"
```

---

### Task 7: Configure Tailwind CSS

**Files:**
- Create: `src/web/client/tailwind.config.js`
- Create: `src/web/client/postcss.config.js`
- Create: `src/web/client/src/styles/index.css`

- [ ] **Step 1: Create tailwind.config.js with role colors**

Create `src/web/client/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Arena roles
        'role-trendhunter': '#ff6b6b',
        'role-uservoice': '#4ecdc4',
        'role-engineer': '#45b7d1',
        'role-deviladvocate': '#e94560',
        'role-minimalist': '#feca57',
        'role-philosopher': '#a78bfa',
        // Pipeline agents
        'role-designer': '#a78bfa',
        'role-reviewer': '#fb923c',
        'role-deployer': '#34d399',
        'role-moderator': '#e94560',
        // UI
        'arena-bg': '#0f0f1a',
        'arena-card': '#1a1a2e',
        'arena-border': '#16213e',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Create postcss.config.js**

Create `src/web/client/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Create index.css with Tailwind imports**

Create `src/web/client/src/styles/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom scrollbar for dark theme */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: #1a1a2e;
}
::-webkit-scrollbar-thumb {
  background: #16213e;
  border-radius: 4px;
}

/* Animation for new events */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slide-in {
  animation: slideIn 0.3s ease-out;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/web/client/tailwind.config.js src/web/client/postcss.config.js src/web/client/src/styles/
git commit -m "feat(web): add Tailwind CSS configuration with role colors"
```

---

### Task 8: Create Frontend Types and Utilities

**Files:**
- Create: `src/web/client/src/types/event.ts`
- Create: `src/web/client/src/utils/roleColors.ts`

- [ ] **Step 1: Create frontend event types**

Create `src/web/client/src/types/event.ts`:

```typescript
// Frontend event types — synced with backend shared/types.ts

export type EventType =
  | 'phase_start'
  | 'phase_end'
  | 'role_pitch'
  | 'role_attack'
  | 'role_defense'
  | 'role_speak'
  | 'moderator_summary'
  | 'synthesis'
  | 'scoring'
  | 'design_output'
  | 'builder_output'
  | 'builder_summary'
  | 'review_findings'
  | 'review_fix'
  | 'deploy_summary'
  | 'error';

export interface ObsEvent {
  ts: number;
  time: string;
  type: EventType;
  phase: string;
  role: string;
  content: string;
  meta: Record<string, unknown>;
}

export interface WebSocketMessage {
  type: 'event' | 'history' | 'control' | 'export';
  data: ObsEvent | ObsEvent[];
}
```

- [ ] **Step 2: Create role colors utility**

Create `src/web/client/src/utils/roleColors.ts`:

```typescript
// Role color mapping — synced with TerminalFormatter

const ROLE_COLORS: Record<string, string> = {
  TrendHunter: 'role-trendhunter',
  UserVoice: 'role-uservoice',
  Engineer: 'role-engineer',
  DevilAdvocate: 'role-deviladvocate',
  Minimalist: 'role-minimalist',
  Philosopher: 'role-philosopher',
  Moderator: 'role-moderator',
  DESIGNER: 'role-designer',
  REVIEWER: 'role-reviewer',
  DEPLOYER: 'role-deployer',
  Orchestrator: 'text-white',
};

export function getRoleColorClass(role: string): string {
  return ROLE_COLORS[role] || 'text-gray-400';
}

export function getRoleTextColor(role: string): string {
  const colors: Record<string, string> = {
    TrendHunter: '#ff6b6b',
    UserVoice: '#4ecdc4',
    Engineer: '#45b7d1',
    DevilAdvocate: '#e94560',
    Minimalist: '#feca57',
    Philosopher: '#a78bfa',
    Moderator: '#e94560',
    DESIGNER: '#a78bfa',
    REVIEWER: '#fb923c',
    DEPLOYER: '#34d399',
  };
  return colors[role] || '#888';
}

const EVENT_ICONS: Record<string, string> = {
  phase_start: '🚀',
  phase_end: '✅',
  role_pitch: '💡',
  role_attack: '⚔️',
  role_defense: '🛡️',
  role_speak: '🗣️',
  moderator_summary: '🎙️',
  synthesis: '🎯',
  scoring: '📊',
  design_output: '📐',
  builder_output: '🔨',
  builder_summary: '📋',
  review_findings: '🔍',
  review_fix: '🔧',
  deploy_summary: '🚀',
  error: '❌',
};

export function getEventIcon(type: string): string {
  return EVENT_ICONS[type] || '·';
}

const PHASE_LABELS: Record<string, string> = {
  idea: '💡 Idea Arena',
  design: '📐 Design',
  build: '🏗️ Build',
  review: '🔍 Review',
  deploy: '🚀 Deploy',
};

export function getPhaseLabel(phase: string): string {
  return PHASE_LABELS[phase] || phase;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/client/src/types/ src/web/client/src/utils/
git commit -m "feat(web): add frontend types and role color utilities"
```

---

### Task 9: Create WebSocket Hook

**Files:**
- Create: `src/web/client/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Create useWebSocket hook**

Create `src/web/client/src/hooks/useWebSocket.ts`:

```typescript
import { useEffect, useState, useCallback, useRef } from 'react';
import type { ObsEvent, WebSocketMessage } from '../types/event';

interface UseWebSocketOptions {
  url: string;
  onEvent?: (event: ObsEvent) => void;
  onHistory?: (events: ObsEvent[]) => void;
  onExport?: (events: ObsEvent[]) => void;
}

interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
  paused: boolean;
  error?: string;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const { url, onEvent, onHistory, onExport } = options;
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    reconnecting: false,
    paused: false,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setState({ connected: true, reconnecting: false, paused: false });
    };

    ws.onmessage = (event) => {
      try {
        const msg: WebSocketMessage = JSON.parse(event.data);
        if (msg.type === 'event' && !Array.isArray(msg.data)) {
          onEvent?.(msg.data as ObsEvent);
        } else if (msg.type === 'history' && Array.isArray(msg.data)) {
          onHistory?.(msg.data as ObsEvent[]);
        } else if (msg.type === 'export' && Array.isArray(msg.data)) {
          onExport?.(msg.data as ObsEvent[]);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      setState({ connected: false, reconnecting: false, paused: false, error: 'Connection error' });
    };

    ws.onclose = () => {
      setState({ connected: false, reconnecting: true, paused: false });
      // Reconnect after 2 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 2000);
    };
  }, [url, onEvent, onHistory, onExport]);

  const sendControl = useCallback((action: 'pause' | 'resume' | 'clear' | 'export') => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'control', data: { action } }));
      if (action === 'pause') {
        setState((prev) => ({ ...prev, paused: true }));
      } else if (action === 'resume') {
        setState((prev) => ({ ...prev, paused: false }));
      }
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { state, sendControl };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/client/src/hooks/useWebSocket.ts
git commit -m "feat(web): add WebSocket connection hook with reconnect logic"
```

---

### Task 10: Create Basic App Component

**Files:**
- Create: `src/web/client/src/App.tsx`

- [ ] **Step 1: Create App.tsx with basic layout**

Create `src/web/client/src/App.tsx`:

```typescript
import { useState, useCallback } from 'react';
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

  return (
    <div className="min-h-screen bg-arena-bg text-gray-100">
      {/* Header */}
      <header className="bg-arena-card border-b border-arena-border px-4 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Arena Web UI</h1>
          <ConnectionStatus state={state} />
        </div>
        <ControlBar
          onClear={handleClear}
          onPause={handlePause}
          onResume={handleResume}
          onExport={() => sendControl('export')}
          connected={state.connected}
          paused={state.paused}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/web/client/src/App.tsx
git commit -m "feat(web): add main App component with dual-panel layout"
```

---

## Phase 2: UI Components

### Task 11: Create EventCard Component

**Files:**
- Create: `src/web/client/src/components/EventCard.tsx`

- [ ] **Step 1: Create EventCard component**

Create `src/web/client/src/components/EventCard.tsx`:

```typescript
import type { ObsEvent } from '../types/event';
import { getRoleTextColor, getEventIcon } from '../utils/roleColors';

interface EventCardProps {
  event: ObsEvent;
  selected: boolean;
  onClick: () => void;
}

export function EventCard({ event, selected, onClick }: EventCardProps) {
  const roleColor = getRoleTextColor(event.role);
  const icon = getEventIcon(event.type);

  // Highlight @mentions in content
  const highlightMentions = (content: string) => {
    const mentionPattern = /@(\w+)|(\w+),/g;
    return content.replace(mentionPattern, (match, name1, name2) => {
      const name = name1 || name2;
      return `<span class="text-yellow-400 font-semibold">${match}</span>`;
    });
  };

  return (
    <div
      onClick={onClick}
      className={`arena-card p-3 rounded-lg cursor-pointer transition-all animate-slide-in
        ${selected ? 'ring-2 ring-role-philosopher' : 'hover:bg-arena-border'}`}
      style={{ backgroundColor: '#16213e' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span style={{ color: roleColor }} className="font-semibold">
          {event.role}
        </span>
        <span className="text-xs text-gray-500">
          [{event.type}]
        </span>
      </div>
      <p
        className="text-sm text-gray-300 whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: highlightMentions(event.content) }}
      />
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
        <span>{event.phase}</span>
        <span>·</span>
        <span>{new Date(event.ts).toLocaleTimeString()}</span>
        {event.meta.turn && <span>· Turn {event.meta.turn}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/client/src/components/EventCard.tsx
git commit -m "feat(web): add EventCard component with role colors and @mention highlight"
```

---

### Task 12: Create Timeline Component

**Files:**
- Create: `src/web/client/src/components/Timeline.tsx`

- [ ] **Step 1: Create Timeline component**

Create `src/web/client/src/components/Timeline.tsx`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/web/client/src/components/Timeline.tsx
git commit -m "feat(web): add Timeline component with auto-scroll and phase separators"
```

---

### Task 13: Create DetailPanel Component

**Files:**
- Create: `src/web/client/src/components/DetailPanel.tsx`

- [ ] **Step 1: Create DetailPanel component**

Create `src/web/client/src/components/DetailPanel.tsx`:

```typescript
import type { ObsEvent } from '../types/event';
import { getPhaseLabel, getRoleTextColor } from '../utils/roleColors';

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
                {role}: {count}
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
              {selectedEvent.type} · {selectedEvent.role}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/web/client/src/components/DetailPanel.tsx
git commit -m "feat(web): add DetailPanel with phase info, role stats, and scores"
```

---

### Task 14: Create ControlBar and ConnectionStatus Components

**Files:**
- Create: `src/web/client/src/components/ControlBar.tsx`
- Create: `src/web/client/src/components/ConnectionStatus.tsx`

- [ ] **Step 1: Create ControlBar component**

Create `src/web/client/src/components/ControlBar.tsx`:

```typescript
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
```

- [ ] **Step 2: Create ConnectionStatus component**

Create `src/web/client/src/components/ConnectionStatus.tsx`:

```typescript
interface ConnectionState {
  connected: boolean;
  reconnecting: boolean;
  error?: string;
}

interface ConnectionStatusProps {
  state: ConnectionState;
}

export function ConnectionStatus({ state }: ConnectionStatusProps) {
  const statusColor = state.connected
    ? 'text-green-400'
    : state.reconnecting
    ? 'text-yellow-400'
    : 'text-red-400';

  const statusText = state.connected
    ? '● Connected'
    : state.reconnecting
    ? '● Reconnecting...'
    : state.error
    ? `● ${state.error}`
    : '● Disconnected';

  return (
    <div className={`text-xs ${statusColor}`}>
      {statusText}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/client/src/components/ControlBar.tsx src/web/client/src/components/ConnectionStatus.tsx
git commit -m "feat(web): add ControlBar and ConnectionStatus components"
```

---

## Phase 3: Integration

### Task 15: Update CLI with Web Options

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add --web and --port options**

Edit `src/cli.ts`:

Find line 18-25 (options section), add after `--lang`:

```typescript
  .option('--web', 'Start web UI for real-time visualization', false)
  .option('--port <n>', 'Web UI port (default: 8080)', '8080')
```

Find line 26-34 (action function), update options handling:

After `language: options.lang,` add:

```typescript
      startWeb: options.web,
      webPort: parseInt(options.port, 10),
```

- [ ] **Step 2: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): add --web and --port options for web UI"
```

---

### Task 16: Update Orchestrator Config and Integration

**Files:**
- Modify: `src/core/orchestrator.ts`

- [ ] **Step 1: Add web server config to OrchestratorConfig**

Edit `src/core/orchestrator.ts`:

Find line 22-31 (OrchestratorConfig interface), add:

```typescript
  startWeb?: boolean;
  webPort?: number;
```

Find line 42-50 (run method start), after TerminalFormatter.attachTo, add:

```typescript
    // Start web server if requested
    let webServer: WebServer | undefined;
    if (this.config.startWeb) {
      const { WebServer } = await import('../web/server/index.js');
      webServer = new WebServer({
        port: this.config.webPort || 8080,
        eventBus: this.eventBus,
      });
      const url = await webServer.start();
      logger.info('WEB UI', `Started at ${url}`);
    }
```

Add at top import section (line 1-10):

```typescript
import type { WebServer } from '../web/server/index.js';
```

- [ ] **Step 2: Verify compilation**

Run: `npm run build`

Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/core/orchestrator.ts
git commit -m "feat(orchestrator): integrate web server with --web option"
```

---

### Task 17: Build Frontend and Verify Integration

**Files:**
- Build frontend

- [ ] **Step 1: Build frontend**

Run: `cd src/web/client && npm run build`

Expected: `dist/` directory created with bundled files

- [ ] **Step 2: Copy frontend dist to server location**

Run: `mkdir -p src/web/client/dist && ls src/web/client/dist/`

Expected: `index.html` and `assets/` present

- [ ] **Step 3: Test full integration**

Run: `npx tsx src/cli.ts --web "做一个简单的计数器应用"`

Expected:
- CLI starts with "Web UI: http://localhost:8080" message
- Browser opens, shows event stream
- Events flow in real-time

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: integrate arena web UI with full pipeline"
```

---

### Task 18: Add tsconfig for Web Client

**Files:**
- Create: `src/web/client/tsconfig.json`

- [ ] **Step 1: Create tsconfig.json**

Create `src/web/client/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Create tsconfig.node.json**

Create `src/web/client/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/client/tsconfig.json src/web/client/tsconfig.node.json
git commit -m "feat(web): add TypeScript config for frontend"
```

---

## Summary

**Files created:**
- Backend: `src/web/server/index.ts`, `src/web/server/event-bridge.ts`, `src/web/shared/types.ts`
- Frontend: 14 files in `src/web/client/`
- Config: `src/web/client/package.json`, `vite.config.ts`, `tailwind.config.js`, `tsconfig.json`

**Files modified:**
- `package.json` — Added express, ws dependencies
- `src/observability/event-bus.ts` — Added wsBridge setter
- `src/cli.ts` — Added --web, --port options
- `src/core/orchestrator.ts` — Integrated web server startup

**Test verification:**
```bash
# Full pipeline test
npx tsx src/cli.ts --web "做一个计数器"
# Browser opens → event stream displays
```

**Success criteria:**
- WebSocket connection established
- Events stream in real-time
- Role colors display correctly
- @mentions highlighted
- Pause/clear/export buttons work
- All 5 pipeline phases show