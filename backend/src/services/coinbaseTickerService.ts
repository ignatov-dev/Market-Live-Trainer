import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { PriceTick } from '../types/domain.js';

interface CoinbaseTickerConfig {
  url: string;
  products: string[];
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  heartbeatTimeoutMs: number;
}

interface CoinbaseTickerMessage {
  type?: string;
  product_id?: string;
  price?: string;
  time?: string;
}

export class CoinbaseTickerService extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private shuttingDown = false;
  private subscriptions: Set<string>;

  constructor(private readonly cfg: CoinbaseTickerConfig) {
    super();
    this.subscriptions = new Set(cfg.products);
  }

  start(): void {
    this.shuttingDown = false;
    this.connect();
  }

  stop(): void {
    this.shuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  addProduct(symbol: string): void {
    this.subscriptions.add(symbol);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe',
          product_ids: [symbol],
          channels: ['ticker'],
        }),
      );
    }
  }

  private connect(): void {
    if (this.shuttingDown) {
      return;
    }

    const ws = new WebSocket(this.cfg.url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.emit('connected');
      this.resetHeartbeat();

      ws.send(
        JSON.stringify({
          type: 'subscribe',
          product_ids: Array.from(this.subscriptions),
          channels: ['ticker'],
        }),
      );
    });

    ws.on('message', (raw) => {
      this.resetHeartbeat();
      this.handleMessage(raw.toString('utf8'));
    });

    ws.on('close', () => {
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    ws.on('error', (error) => {
      this.emit('error', error);
    });
  }

  private handleMessage(raw: string): void {
    let payload: CoinbaseTickerMessage;

    try {
      payload = JSON.parse(raw) as CoinbaseTickerMessage;
    } catch {
      return;
    }

    if (payload.type !== 'ticker' || !payload.product_id || !payload.price) {
      return;
    }

    const price = Number(payload.price);
    if (!Number.isFinite(price)) {
      return;
    }

    const tick: PriceTick = {
      symbol: payload.product_id,
      price,
      time: payload.time ? new Date(payload.time) : new Date(),
    };

    this.emit('tick', tick);
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown) {
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    const backoff = Math.min(
      this.cfg.reconnectBaseMs * 2 ** this.reconnectAttempts,
      this.cfg.reconnectMaxMs,
    );

    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, backoff);
  }

  private resetHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }

    this.heartbeatTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.terminate();
      }
    }, this.cfg.heartbeatTimeoutMs);
  }
}
