import type { IncomingMessage } from 'node:http';
import { URL } from 'node:url';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  PositionEvent,
  PositionPnlUpdate,
  PriceTick,
  TradingAccount,
} from '../types/domain.js';
import { AuthService } from './authService.js';

interface AuthedClient {
  userId: string;
  socket: WebSocket;
}

export class RealtimeGateway {
  private readonly positionsWss: WebSocketServer;
  private readonly positionsPnlWss: WebSocketServer;
  private readonly accountWss: WebSocketServer;
  private readonly marketWss: WebSocketServer;
  private readonly positionClients = new Set<AuthedClient>();
  private readonly positionsPnlClients = new Set<AuthedClient>();
  private readonly accountClients = new Set<AuthedClient>();
  private readonly marketClients = new Set<WebSocket>();
  private readonly auth: AuthService;

  constructor(server: HttpServer, auth: AuthService) {
    this.positionsWss = new WebSocketServer({ noServer: true });
    this.positionsPnlWss = new WebSocketServer({ noServer: true });
    this.accountWss = new WebSocketServer({ noServer: true });
    this.marketWss = new WebSocketServer({ noServer: true });
    this.auth = auth;

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '', 'http://localhost');
      if (url.pathname === '/ws') {
        this.positionsWss.handleUpgrade(request, socket, head, (ws) => {
          this.positionsWss.emit('connection', ws, request);
        });
        return;
      }

      if (url.pathname === '/ws/positions') {
        this.positionsPnlWss.handleUpgrade(request, socket, head, (ws) => {
          this.positionsPnlWss.emit('connection', ws, request);
        });
        return;
      }

      if (url.pathname === '/ws/account') {
        this.accountWss.handleUpgrade(request, socket, head, (ws) => {
          this.accountWss.emit('connection', ws, request);
        });
        return;
      }

      if (url.pathname === '/ws/market') {
        this.marketWss.handleUpgrade(request, socket, head, (ws) => {
          this.marketWss.emit('connection', ws, request);
        });
        return;
      }
    });

    this.positionsWss.on('connection', (socket, request) => this.onPositionConnection(socket, request));
    this.positionsPnlWss.on('connection', (socket, request) => this.onPositionsPnlConnection(socket, request));
    this.accountWss.on('connection', (socket, request) => this.onAccountConnection(socket, request));
    this.marketWss.on('connection', (socket) => this.onMarketConnection(socket));
  }

  broadcast(event: PositionEvent): void {
    const payload = JSON.stringify(event);

    for (const client of this.positionClients) {
      if (client.socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (client.userId !== event.position.userId) {
        continue;
      }

      client.socket.send(payload);
    }
  }

  broadcastMarketTick(tick: PriceTick): void {
    const payload = JSON.stringify({
      type: 'market.tick',
      symbol: tick.symbol,
      price: tick.price,
      time: tick.time.toISOString(),
    });

    for (const socket of this.marketClients) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      socket.send(payload);
    }
  }

  broadcastPositionPnl(
    userId: string,
    time: Date,
    position: PositionPnlUpdate,
  ): void {
    const payload = JSON.stringify({
      type: 'position.pnl',
      time: time.toISOString(),
      position,
    });

    for (const client of this.positionsPnlClients) {
      if (client.socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (client.userId !== userId) {
        continue;
      }

      client.socket.send(payload);
    }
  }

  broadcastAccountBalance(
    account: TradingAccount,
    source: 'engine' | 'api' | 'system' = 'system',
  ): void {
    const payload = JSON.stringify({
      type: 'account.balance',
      account: {
        userId: account.userId,
        initialBalance: account.initialBalance,
        cashBalance: account.cashBalance,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      },
      source,
    });

    for (const client of this.accountClients) {
      if (client.socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (client.userId !== account.userId) {
        continue;
      }

      client.socket.send(payload);
    }
  }

  close(): void {
    for (const client of this.positionClients) {
      client.socket.close(1001, 'server_shutdown');
    }

    for (const client of this.positionsPnlClients) {
      client.socket.close(1001, 'server_shutdown');
    }

    for (const client of this.accountClients) {
      client.socket.close(1001, 'server_shutdown');
    }

    for (const socket of this.marketClients) {
      socket.close(1001, 'server_shutdown');
    }

    this.positionClients.clear();
    this.positionsPnlClients.clear();
    this.accountClients.clear();
    this.marketClients.clear();
    this.positionsWss.close();
    this.positionsPnlWss.close();
    this.accountWss.close();
    this.marketWss.close();
  }

  private onPositionConnection(socket: WebSocket, request: IncomingMessage): void {
    this.onAuthedConnection(socket, request, this.positionClients, 'realtime channel established');
  }

  private onPositionsPnlConnection(socket: WebSocket, request: IncomingMessage): void {
    this.onAuthedConnection(socket, request, this.positionsPnlClients, 'positions realtime channel established');
  }

  private onAccountConnection(socket: WebSocket, request: IncomingMessage): void {
    this.onAuthedConnection(socket, request, this.accountClients, 'account realtime channel established');
  }

  private onAuthedConnection(
    socket: WebSocket,
    request: IncomingMessage,
    clients: Set<AuthedClient>,
    readyMessage: string,
  ): void {
    const url = new URL(request.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(1008, 'token query param is required');
      return;
    }

    void this.auth.verifyAccessToken(token)
      .then((identity) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        const client: AuthedClient = { userId: identity.userId, socket };
        clients.add(client);

        socket.send(
          JSON.stringify({
            type: 'connection.ready',
            message: readyMessage,
          }),
        );

        socket.on('close', () => {
          clients.delete(client);
        });
      })
      .catch(() => {
        socket.close(1008, 'unauthorized');
      });
  }

  private onMarketConnection(socket: WebSocket): void {
    this.marketClients.add(socket);

    socket.send(
      JSON.stringify({
        type: 'connection.ready',
        message: 'market realtime channel established',
      }),
    );

    socket.on('close', () => {
      this.marketClients.delete(socket);
    });
  }
}
