import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket as WsSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventBridge } from './event-bridge.js';
import type { EventBus } from '../../observability/event-bus.js';
import type { ObsEvent } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface WebServerConfig {
  port: number;
  eventBus: EventBus;
  clientDir?: string;
  onStop?: () => void;  // Callback when user requests stop
}

export class WebServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private bridge: EventBridge;
  private port: number;
  private eventBus: EventBus;

  constructor(config: WebServerConfig) {
    this.port = config.port;
    this.eventBus = config.eventBus;
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.bridge = new EventBridge();

    // Set up stop callback
    if (config.onStop) {
      this.bridge.setStopCallback(config.onStop);
    }

    this.setupRoutes(config.clientDir);
    this.setupWebSocket();
    this.bridgeToEventBus();
  }

  private setupRoutes(clientDir?: string): void {
    const staticDir = clientDir || path.join(__dirname, '../client/dist');
    this.app.use(express.static(staticDir));

    // SPA fallback - catch-all for non-static routes
    this.app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WsSocket) => {
      this.bridge.addClient(ws);

      // Send existing history
      const history = this.eventBus.getHistory();
      this.bridge.sendHistory(ws, history);

      // Handle control commands
      ws.on('message', (data: Buffer) => {
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