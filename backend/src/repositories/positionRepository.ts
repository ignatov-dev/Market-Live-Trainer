import type { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type { ClosePositionInput, CreatePositionInput, Position } from '../types/domain.js';

interface UpdatePositionBracketsInput {
  takeProfit: number | null;
  stopLoss: number | null;
  userId?: string;
}

interface PositionRow {
  id: string;
  user_id: string;
  symbol: string;
  side: 'long' | 'short';
  entry_price: string;
  take_profit: string | null;
  stop_loss: string | null;
  status: 'open' | 'closed';
  close_price: string | null;
  close_reason: 'take_profit' | 'stop_loss' | 'manual' | 'system' | null;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
}

function toPosition(row: PositionRow): Position {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    side: row.side,
    entryPrice: Number(row.entry_price),
    takeProfit: row.take_profit === null ? null : Number(row.take_profit),
    stopLoss: row.stop_loss === null ? null : Number(row.stop_loss),
    status: row.status,
    closePrice: row.close_price === null ? null : Number(row.close_price),
    closeReason: row.close_reason,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    closedAt: row.closed_at === null ? null : new Date(row.closed_at),
  };
}

export class PositionRepository {
  constructor(private readonly db: Pool) {}

  async createPosition(input: CreatePositionInput): Promise<Position> {
    const result = await this.db.query<PositionRow>(
      `
      INSERT INTO positions (
        id, user_id, symbol, side, entry_price, take_profit, stop_loss
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        uuidv4(),
        input.userId,
        input.symbol,
        input.side,
        input.entryPrice,
        input.takeProfit,
        input.stopLoss,
      ],
    );

    return toPosition(result.rows[0]);
  }

  async listPositions(userId: string, status?: 'open' | 'closed'): Promise<Position[]> {
    const params: unknown[] = [userId];
    let query = 'SELECT * FROM positions WHERE user_id = $1';

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.db.query<PositionRow>(query, params);
    return result.rows.map(toPosition);
  }

  async listOpenPositions(): Promise<Position[]> {
    const result = await this.db.query<PositionRow>(
      'SELECT * FROM positions WHERE status = $1 ORDER BY created_at ASC',
      ['open'],
    );

    return result.rows.map(toPosition);
  }

  async getPositionById(positionId: string, userId?: string): Promise<Position | null> {
    const params: unknown[] = [positionId];
    let query = 'SELECT * FROM positions WHERE id = $1';

    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }

    const result = await this.db.query<PositionRow>(query, params);
    if (result.rowCount === 0) {
      return null;
    }

    return toPosition(result.rows[0]);
  }

  async updatePositionBracketsIfOpen(
    positionId: string,
    input: UpdatePositionBracketsInput,
  ): Promise<Position | null> {
    const params: unknown[] = [positionId, input.takeProfit, input.stopLoss];

    let query = `
      UPDATE positions
      SET take_profit = $2, stop_loss = $3
      WHERE id = $1 AND status = 'open'
    `;

    if (input.userId) {
      params.push(input.userId);
      query += ` AND user_id = $${params.length}`;
    }

    query += ' RETURNING *';

    const result = await this.db.query<PositionRow>(query, params);
    if (result.rowCount === 0) {
      return null;
    }

    return toPosition(result.rows[0]);
  }

  async closePositionIfOpen(positionId: string, input: ClosePositionInput): Promise<Position | null> {
    const params: unknown[] = [positionId, input.closePrice, input.closeReason, input.closedAt];

    let query = `
      UPDATE positions
      SET status = 'closed', close_price = $2, close_reason = $3, closed_at = $4
      WHERE id = $1 AND status = 'open'
    `;

    if (input.userId) {
      params.push(input.userId);
      query += ` AND user_id = $${params.length}`;
    }

    query += ' RETURNING *';

    const result = await this.db.query<PositionRow>(query, params);
    if (result.rowCount === 0) {
      return null;
    }

    return toPosition(result.rows[0]);
  }
}
