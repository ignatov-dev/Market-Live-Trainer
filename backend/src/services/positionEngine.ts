import type { Position, PositionCloseReason, PriceTick } from '../types/domain.js';
import { PositionRepository } from '../repositories/positionRepository.js';
import { RealtimeGateway } from './realtimeGateway.js';

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
    }
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
