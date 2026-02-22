import type { Position, PositionCloseReason, PositionPnlUpdate, PriceTick } from '../types/domain.js';
import { PositionRepository } from '../repositories/positionRepository.js';
import { RealtimeGateway } from './realtimeGateway.js';

const ESTIMATED_CLOSE_FEE_RATE = 0.0004;

export class PositionEngine {
  private readonly openBySymbol = new Map<string, Map<string, Position>>();

  constructor(
    private readonly repository: PositionRepository,
    private readonly realtime: RealtimeGateway,
  ) {}

  async bootstrap(): Promise<void> {
    const open = await this.repository.listOpenPositions();
    this.openBySymbol.clear();

    for (const position of open) {
      this.track(position);
    }
  }

  register(position: Position): void {
    if (position.status !== 'open') {
      return;
    }

    this.track(position);
  }

  unregister(positionId: string, symbol: string): void {
    const bucket = this.openBySymbol.get(symbol);
    if (!bucket) {
      return;
    }

    bucket.delete(positionId);
    if (bucket.size === 0) {
      this.openBySymbol.delete(symbol);
    }
  }

  resetUser(userId: string): void {
    for (const [symbol, bucket] of this.openBySymbol) {
      for (const [positionId, position] of bucket) {
        if (position.userId === userId) {
          bucket.delete(positionId);
        }
      }

      if (bucket.size === 0) {
        this.openBySymbol.delete(symbol);
      }
    }
  }

  async onTick(tick: PriceTick): Promise<void> {
    const bucket = this.openBySymbol.get(tick.symbol);
    if (!bucket || bucket.size === 0) {
      return;
    }

    // Snapshot first to avoid iterator invalidation while closing positions.
    const candidates = Array.from(bucket.values());

    for (const position of candidates) {
      const decision = this.evaluate(position, tick.price);
      if (!decision) {
        continue;
      }

      const closed = await this.repository.closePositionIfOpen(position.id, {
        closePrice: decision.closePrice,
        closeReason: decision.reason,
        closedAt: tick.time,
      });

      if (!closed) {
        continue;
      }

      this.unregister(closed.id, closed.symbol);
      this.realtime.broadcast({
        type: 'position.closed',
        position: closed,
        source: 'engine',
      });
      const account = await this.repository.getOrCreateTradingAccount(closed.userId);
      this.realtime.broadcastAccountBalance(account, 'engine');
      await this.realtime.broadcastScoreboard().catch(() => {
        // non-critical — scoreboard update failure must not interrupt engine tick
      });
    }

    const remaining = this.openBySymbol.get(tick.symbol);
    if (!remaining || remaining.size === 0) {
      return;
    }

    this.broadcastOpenPositionPnl(tick, Array.from(remaining.values()));
  }

  private broadcastOpenPositionPnl(tick: PriceTick, positions: Position[]): void {
    const updatesByUser = new Map<string, PositionPnlUpdate[]>();

    for (const position of positions) {
      const direction = position.side === 'long' ? 1 : -1;
      const grossPnl = (tick.price - position.entryPrice) * position.quantity * direction;
      const paidOpenFee = position.entryPrice * position.quantity * ESTIMATED_CLOSE_FEE_RATE;
      const estimatedCloseFee = tick.price * position.quantity * ESTIMATED_CLOSE_FEE_RATE;
      const update: PositionPnlUpdate = {
        positionId: position.id,
        symbol: position.symbol,
        side: position.side,
        quantity: position.quantity,
        entryPrice: position.entryPrice,
        markPrice: tick.price,
        unrealizedPnl: grossPnl,
        paidOpenFee,
        estimatedCloseFee,
        unrealizedNetPnl: grossPnl - estimatedCloseFee,
        unrealizedTotalNetPnl: grossPnl - estimatedCloseFee - paidOpenFee,
      };

      const existing = updatesByUser.get(position.userId);
      if (existing) {
        existing.push(update);
      } else {
        updatesByUser.set(position.userId, [update]);
      }
    }

    const unrealizedNetPnlByUser = new Map<string, number>();
    for (const [userId, userUpdates] of updatesByUser) {
      for (const update of userUpdates) {
        this.realtime.broadcastPositionPnl(userId, tick.time, update);
      }
      unrealizedNetPnlByUser.set(
        userId,
        userUpdates.reduce((sum, u) => sum + u.unrealizedNetPnl, 0),
      );
    }
    this.realtime.broadcastScoreboardTick(tick.symbol, unrealizedNetPnlByUser);
  }

  private track(position: Position): void {
    let bucket = this.openBySymbol.get(position.symbol);

    if (!bucket) {
      bucket = new Map<string, Position>();
      this.openBySymbol.set(position.symbol, bucket);
    }

    bucket.set(position.id, position);
  }

  private evaluate(
    position: Position,
    lastPrice: number,
  ): { reason: PositionCloseReason; closePrice: number } | null {
    if (position.side === 'long') {
      if (position.stopLoss !== null && lastPrice <= position.stopLoss) {
        return { reason: 'stop_loss', closePrice: position.stopLoss };
      }

      if (position.takeProfit !== null && lastPrice >= position.takeProfit) {
        return { reason: 'take_profit', closePrice: position.takeProfit };
      }

      return null;
    }

    if (position.stopLoss !== null && lastPrice >= position.stopLoss) {
      return { reason: 'stop_loss', closePrice: position.stopLoss };
    }

    if (position.takeProfit !== null && lastPrice <= position.takeProfit) {
      return { reason: 'take_profit', closePrice: position.takeProfit };
    }

    return null;
  }
}
