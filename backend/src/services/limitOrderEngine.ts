import type { LimitOrder, PriceTick } from '../types/domain.js';
import { LimitOrderRepository } from '../repositories/limitOrderRepository.js';
import { PositionRepository } from '../repositories/positionRepository.js';
import { RealtimeGateway } from './realtimeGateway.js';
import { PositionEngine } from './positionEngine.js';

export class LimitOrderEngine {
  private readonly pendingBySymbol = new Map<string, Map<string, LimitOrder>>();

  constructor(
    private readonly repository: LimitOrderRepository,
    private readonly positionRepository: PositionRepository,
    private readonly positionEngine: PositionEngine,
    private readonly realtime: RealtimeGateway,
  ) {}

  async bootstrap(): Promise<void> {
    const pending = await this.repository.listPendingOrders();
    this.pendingBySymbol.clear();

    for (const order of pending) {
      this.track(order);
    }
  }

  register(order: LimitOrder): void {
    if (order.status !== 'pending') {
      return;
    }

    this.track(order);
  }

  unregister(orderId: string, symbol: string): void {
    const bucket = this.pendingBySymbol.get(symbol);
    if (!bucket) {
      return;
    }

    bucket.delete(orderId);
    if (bucket.size === 0) {
      this.pendingBySymbol.delete(symbol);
    }
  }

  resetUser(userId: string): void {
    for (const [symbol, bucket] of this.pendingBySymbol) {
      for (const [orderId, order] of bucket) {
        if (order.userId === userId) {
          bucket.delete(orderId);
        }
      }

      if (bucket.size === 0) {
        this.pendingBySymbol.delete(symbol);
      }
    }
  }

  async onTick(tick: PriceTick): Promise<void> {
    const bucket = this.pendingBySymbol.get(tick.symbol);
    if (!bucket || bucket.size === 0) {
      return;
    }

    const candidates = Array.from(bucket.values());

    for (const order of candidates) {
      const isBuyFill = order.side === 'buy' && tick.price <= order.limitPrice;
      const isSellFill = order.side === 'sell' && tick.price >= order.limitPrice;
      if (!isBuyFill && !isSellFill) {
        continue;
      }

      try {
        const filled = await this.repository.fillLimitOrder(order.id, tick.time);
        if (!filled) {
          this.unregister(order.id, order.symbol);
          continue;
        }

        this.unregister(order.id, order.symbol);
        this.positionEngine.register(filled.position);

        this.realtime.broadcast({
          type: 'position.created',
          position: filled.position,
          source: 'engine',
        });

        this.realtime.broadcastLimitOrder({
          type: 'limit_order.filled',
          order: filled.order,
          source: 'engine',
        });

        const account = await this.positionRepository.getOrCreateTradingAccount(order.userId);
        this.realtime.broadcastAccountBalance(account, 'engine');
        await this.realtime.broadcastScoreboard().catch(() => {
          // non-critical — scoreboard update failure must not interrupt engine tick
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('Insufficient account balance')) {
          const canceled = await this.repository.cancelLimitOrderIfPending(order.id);
          if (canceled) {
            this.unregister(order.id, order.symbol);
            this.realtime.broadcastLimitOrder({
              type: 'limit_order.canceled',
              order: canceled,
              source: 'engine',
            });
          }
          continue;
        }

        throw error;
      }
    }
  }

  private track(order: LimitOrder): void {
    let bucket = this.pendingBySymbol.get(order.symbol);

    if (!bucket) {
      bucket = new Map<string, LimitOrder>();
      this.pendingBySymbol.set(order.symbol, bucket);
    }

    bucket.set(order.id, order);
  }
}
