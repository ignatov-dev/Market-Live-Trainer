import type { IncomingMessage } from 'node:http';
import { URL } from 'node:url';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  PositionEvent,
  PositionPnlUpdate,
  PriceTick,
  ScoreboardEntry,
  TradingAccount,
} from '../types/domain.js';
import { AuthService } from './authService.js';
import type { PositionRepository } from '../repositories/positionRepository.js';

interface AuthedClient {
  userId: string;
  socket: WebSocket;
}

interface ScoreboardCacheRow {
  userId: string;
  userName: string;
  initialBalance: number;
  cashBalance: number;
}

export class RealtimeGateway {
  private readonly positionsWss: WebSocketServer;
  private readonly positionsPnlWss: WebSocketServer;
  private readonly accountWss: WebSocketServer;
  private readonly marketWss: WebSocketServer;
  private readonly scoreboardWss: WebSocketServer;
  private readonly positionClients = new Set<AuthedClient>();
  private readonly positionsPnlClients = new Set<AuthedClient>();
  private readonly accountClients = new Set<AuthedClient>();
  private readonly marketClients = new Set<WebSocket>();
  private readonly scoreboardClients = new Set<AuthedClient>();
  private scoreboardCache: ScoreboardCacheRow[] = [];
  private lastScoreboardTickAt = 0;
  // Per-symbol → per-user unrealized net PnL cache, so broadcastScoreboard()
  // can include live unrealized instead of zeroing it out on every position event.
  private readonly unrealizedBySymbolAndUser = new Map<string, Map<string, number>>();
  private readonly auth: AuthService;
  private readonly repository: PositionRepository;

  constructor(server: HttpServer, auth: AuthService, repository: PositionRepository) {
    this.positionsWss = new WebSocketServer({ noServer: true });
    this.positionsPnlWss = new WebSocketServer({ noServer: true });
    this.accountWss = new WebSocketServer({ noServer: true });
    this.marketWss = new WebSocketServer({ noServer: true });
    this.scoreboardWss = new WebSocketServer({ noServer: true });
    this.auth = auth;
    this.repository = repository;

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

      if (url.pathname === '/ws/scoreboard') {
        this.scoreboardWss.handleUpgrade(request, socket, head, (ws) => {
          this.scoreboardWss.emit('connection', ws, request);
        });
        return;
      }
    });

    this.positionsWss.on('connection', (socket, request) => this.onPositionConnection(socket, request));
    this.positionsPnlWss.on('connection', (socket, request) => this.onPositionsPnlConnection(socket, request));
    this.accountWss.on('connection', (socket, request) => this.onAccountConnection(socket, request));
    this.marketWss.on('connection', (socket) => this.onMarketConnection(socket));
    this.scoreboardWss.on('connection', (socket, request) => this.onScoreboardConnection(socket, request));
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

  async broadcastScoreboard(): Promise<void> {
    if (this.scoreboardClients.size === 0) {
      return;
    }

    const raw = await this.repository.listScoreboardRaw();
    this.scoreboardCache = raw;
    // Use the cached unrealized so users with open positions don't see a
    // temporary "unrealized = 0" spike every time any position event fires.
    this.sendToScoreboardClients(this.toScoreboardEntries(raw, this.mergedUnrealizedByUser()));
  }

  broadcastScoreboardTick(symbol: string, unrealizedNetPnlByUser: Map<string, number>): void {
    if (this.scoreboardClients.size === 0 || this.scoreboardCache.length === 0) {
      return;
    }

    const now = Date.now();
    if (now - this.lastScoreboardTickAt < 3_000) {
      return;
    }
    this.lastScoreboardTickAt = now;

    // Store the latest unrealized values for this symbol so they survive
    // broadcastScoreboard() calls triggered by unrelated position events.
    let symbolMap = this.unrealizedBySymbolAndUser.get(symbol);
    if (!symbolMap) {
      symbolMap = new Map<string, number>();
      this.unrealizedBySymbolAndUser.set(symbol, symbolMap);
    }
    for (const [userId, unrealized] of unrealizedNetPnlByUser) {
      symbolMap.set(userId, unrealized);
    }

    this.sendToScoreboardClients(this.toScoreboardEntries(this.scoreboardCache, this.mergedUnrealizedByUser()));
  }

  clearUnrealizedForUser(userId: string): void {
    for (const symbolMap of this.unrealizedBySymbolAndUser.values()) {
      symbolMap.delete(userId);
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

    for (const client of this.scoreboardClients) {
      client.socket.close(1001, 'server_shutdown');
    }

    this.positionClients.clear();
    this.positionsPnlClients.clear();
    this.accountClients.clear();
    this.marketClients.clear();
    this.scoreboardClients.clear();
    this.positionsWss.close();
    this.positionsPnlWss.close();
    this.accountWss.close();
    this.marketWss.close();
    this.scoreboardWss.close();
  }

  private mergedUnrealizedByUser(): Map<string, number> {
    const result = new Map<string, number>();
    for (const symbolMap of this.unrealizedBySymbolAndUser.values()) {
      for (const [userId, unrealized] of symbolMap) {
        result.set(userId, (result.get(userId) ?? 0) + unrealized);
      }
    }
    return result;
  }

  private toScoreboardEntries(
    rows: ScoreboardCacheRow[],
    unrealizedByUser?: Map<string, number>,
  ): ScoreboardEntry[] {
    return rows
      .map((row) => {
        const unrealized = unrealizedByUser?.get(row.userId) ?? 0;
        const netPnl = Math.round((row.cashBalance + unrealized - row.initialBalance) * 100) / 100;
        return { userId: row.userId, userName: row.userName, netPnl };
      })
      .sort((a, b) => b.netPnl - a.netPnl);
  }

  private sendToScoreboardClients(entries: ScoreboardEntry[]): void {
    const payload = JSON.stringify({ type: 'scoreboard_update', payload: entries });
    for (const client of this.scoreboardClients) {
      if (client.socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      client.socket.send(payload);
    }
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

  private onScoreboardConnection(socket: WebSocket, request: IncomingMessage): void {
    const url = new URL(request.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(1008, 'token query param is required');
      return;
    }

    void this.auth.verifyAccessToken(token)
      .then(async (identity) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        // Persist the display name derived from JWT claims
        const { userId, claims } = identity;
        const userName =
          (typeof claims.name === 'string' && claims.name.trim().length > 0)
            ? claims.name.trim()
            : (typeof claims.email === 'string' && claims.email.trim().length > 0)
              ? claims.email.split('@')[0]!
              : userId.slice(0, 8);

        // Ensure the account row exists before attempting the UPDATE in upsertUserName.
        // Without this, upsertUserName silently affects 0 rows for users who
        // connect to the scoreboard before ever opening a position.
        await this.repository.getOrCreateTradingAccount(userId);
        await this.repository.upsertUserName(userId, userName);

        const client: AuthedClient = { userId, socket };
        this.scoreboardClients.add(client);

        socket.send(
          JSON.stringify({
            type: 'connection.ready',
            message: 'scoreboard channel established',
          }),
        );

        // Send the current scoreboard snapshot immediately on connect and refresh cache
        const raw = await this.repository.listScoreboardRaw();
        this.scoreboardCache = raw;
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'scoreboard_update', payload: this.toScoreboardEntries(raw) }));
        }

        socket.on('close', () => {
          this.scoreboardClients.delete(client);
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
