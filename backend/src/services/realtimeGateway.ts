import type { IncomingMessage } from 'node:http';
import { URL } from 'node:url';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { PositionEvent } from '../types/domain.js';

interface AuthedClient {
  userId: string;
  socket: WebSocket;
}

export class RealtimeGateway {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<AuthedClient>();

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '', 'http://localhost');
      if (url.pathname !== '/ws') {
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    });

    this.wss.on('connection', (socket, request) => this.onConnection(socket, request));
  }

  broadcast(event: PositionEvent): void {
    const payload = JSON.stringify(event);

    for (const client of this.clients) {
      if (client.socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (client.userId !== event.position.userId) {
        continue;
      }

      client.socket.send(payload);
    }
  }

  close(): void {
    for (const client of this.clients) {
      client.socket.close(1001, 'server_shutdown');
    }

    this.clients.clear();
    this.wss.close();
  }

  private onConnection(socket: WebSocket, request: IncomingMessage): void {
    const url = new URL(request.url ?? '', 'http://localhost');
    const userId = url.searchParams.get('userId');

    if (!userId) {
      socket.close(1008, 'userId query param is required');
      return;
    }

    const client: AuthedClient = { userId, socket };
    this.clients.add(client);

    socket.send(
      JSON.stringify({
        type: 'connection.ready',
        message: 'realtime channel established',
      }),
    );

    socket.on('close', () => {
      this.clients.delete(client);
    });
  }
}
