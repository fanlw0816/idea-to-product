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