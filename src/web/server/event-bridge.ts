import WebSocket from 'ws';
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