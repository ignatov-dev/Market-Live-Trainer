import type { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type {
  CreateLimitOrderInput,
  LimitOrder,
  LimitOrderStatus,
  Position,
  TradingAccount,
} from '../types/domain.js';
import { DEFAULT_INITIAL_BALANCE, FEE_RATE } from '../constants/trading.js';

interface LimitOrderRow {
  id: string;
  user_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: string;
  limit_price: string;
  take_profit: string | null;
  stop_loss: string | null;
  status: 'pending' | 'filled' | 'canceled';
  position_id: string | null;
  filled_at: Date | null;
  canceled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface PositionRow {
  id: string;
  user_id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: string;
  entry_price: string;
  take_profit: string | null;
  stop_loss: string | null;
  status: 'open' | 'closed';
  close_price: string | null;
  close_pnl: string | null;
  close_reason: 'take_profit' | 'stop_loss' | 'manual' | 'system' | null;
  balance_before: string | null;
  balance_after: string | null;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
}

interface TradingAccountRow {
  user_id: string;
  initial_balance: string;
  cash_balance: string;
  created_at: Date;
  updated_at: Date;
}

function toLimitOrder(row: LimitOrderRow): LimitOrder {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    side: row.side,
    quantity: Number(row.quantity),
    limitPrice: Number(row.limit_price),
    takeProfit: row.take_profit === null ? null : Number(row.take_profit),
    stopLoss: row.stop_loss === null ? null : Number(row.stop_loss),
    status: row.status,
    positionId: row.position_id,
    filledAt: row.filled_at === null ? null : new Date(row.filled_at),
    canceledAt: row.canceled_at === null ? null : new Date(row.canceled_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toPosition(row: PositionRow): Position {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    side: row.side,
    quantity: Number(row.quantity),
    entryPrice: Number(row.entry_price),
    takeProfit: row.take_profit === null ? null : Number(row.take_profit),
    stopLoss: row.stop_loss === null ? null : Number(row.stop_loss),
    status: row.status,
    closePrice: row.close_price === null ? null : Number(row.close_price),
    closePnl: row.close_pnl == null ? null : Number(row.close_pnl),
    closeReason: row.close_reason,
    balanceBefore: row.balance_before === null ? null : Number(row.balance_before),
    balanceAfter: row.balance_after === null ? null : Number(row.balance_after),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    closedAt: row.closed_at === null ? null : new Date(row.closed_at),
  };
}

function toTradingAccount(row: TradingAccountRow): TradingAccount {
  return {
    userId: row.user_id,
    initialBalance: Number(row.initial_balance),
    cashBalance: Number(row.cash_balance),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class LimitOrderRepository {
  constructor(private readonly db: Pool) {}

  async createLimitOrder(input: CreateLimitOrderInput): Promise<LimitOrder> {
    const result = await this.db.query<LimitOrderRow>(
      `
      INSERT INTO limit_orders (
        id, user_id, symbol, side, quantity, limit_price, take_profit, stop_loss
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        uuidv4(),
        input.userId,
        input.symbol,
        input.side,
        input.quantity,
        input.limitPrice,
        input.takeProfit,
        input.stopLoss,
      ],
    );

    return toLimitOrder(result.rows[0]!);
  }

  async listLimitOrders(userId: string, status?: LimitOrderStatus): Promise<LimitOrder[]> {
    const params: unknown[] = [userId];
    let query = 'SELECT * FROM limit_orders WHERE user_id = $1';

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.db.query<LimitOrderRow>(query, params);
    return result.rows.map(toLimitOrder);
  }

  async listPendingOrders(): Promise<LimitOrder[]> {
    const result = await this.db.query<LimitOrderRow>(
      'SELECT * FROM limit_orders WHERE status = $1 ORDER BY created_at ASC',
      ['pending'],
    );

    return result.rows.map(toLimitOrder);
  }

  async cancelLimitOrderIfPending(orderId: string, userId?: string): Promise<LimitOrder | null> {
    const params: unknown[] = [orderId];
    let query = `
      UPDATE limit_orders
      SET status = 'canceled', canceled_at = NOW()
      WHERE id = $1 AND status = 'pending'
    `;

    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }

    query += ' RETURNING *';

    const result = await this.db.query<LimitOrderRow>(query, params);
    if (result.rowCount === 0) {
      return null;
    }

    return toLimitOrder(result.rows[0]!);
  }

  async fillLimitOrder(
    orderId: string,
    filledAt: Date,
  ): Promise<{ order: LimitOrder; position: Position } | null> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const locked = await client.query<LimitOrderRow>(
        `
        SELECT *
        FROM limit_orders
        WHERE id = $1
          AND status = 'pending'
        FOR UPDATE
        `,
        [orderId],
      );

      if (locked.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const order = toLimitOrder(locked.rows[0]!);
      const account = await this.ensureTradingAccount(client, order.userId);

      const entryPrice = order.limitPrice;
      const openFee = entryPrice * order.quantity * FEE_RATE;
      if (!Number.isFinite(openFee) || openFee < 0) {
        throw new Error('Invalid open fee.');
      }

      if (account.cashBalance < openFee) {
        throw new Error('Insufficient account balance.');
      }

      const updatedAccountResult = await client.query<TradingAccountRow>(
        `
        UPDATE trading_accounts
        SET cash_balance = cash_balance - $2
        WHERE user_id = $1
        RETURNING *
        `,
        [order.userId, openFee],
      );
      const updatedAccount = toTradingAccount(updatedAccountResult.rows[0]!);

      const positionSide = order.side === 'buy' ? 'long' : 'short';
      const positionResult = await client.query<PositionRow>(
        `
        INSERT INTO positions (
          id, user_id, symbol, side, quantity, entry_price, take_profit, stop_loss
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
          uuidv4(),
          order.userId,
          order.symbol,
          positionSide,
          order.quantity,
          entryPrice,
          order.takeProfit,
          order.stopLoss,
        ],
      );

      const position = toPosition(positionResult.rows[0]!);

      await client.query(
        `
        INSERT INTO account_ledger (
          id, user_id, entry_type, amount, balance_after, position_id, metadata
        ) VALUES ($1, $2, 'open_fee', $3, $4, $5, $6::jsonb)
        `,
        [
          uuidv4(),
          order.userId,
          -openFee,
          updatedAccount.cashBalance,
          position.id,
          JSON.stringify({ symbol: order.symbol, limitOrderId: order.id }),
        ],
      );

      const updatedOrderResult = await client.query<LimitOrderRow>(
        `
        UPDATE limit_orders
        SET status = 'filled', filled_at = $2, position_id = $3
        WHERE id = $1
        RETURNING *
        `,
        [order.id, filledAt, position.id],
      );

      await client.query('COMMIT');

      return { order: toLimitOrder(updatedOrderResult.rows[0]!), position };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureTradingAccount(client: PoolClient, userId: string): Promise<TradingAccount> {
    const inserted = await client.query<TradingAccountRow>(
      `
      INSERT INTO trading_accounts (user_id, initial_balance, cash_balance)
      VALUES ($1, $2, $2)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING *
      `,
      [userId, DEFAULT_INITIAL_BALANCE],
    );

    if ((inserted.rowCount ?? 0) > 0) {
      const account = toTradingAccount(inserted.rows[0]!);
      await client.query(
        `
        INSERT INTO account_ledger (
          id, user_id, entry_type, amount, balance_after, metadata
        ) VALUES ($1, $2, 'init', $3, $4, $5::jsonb)
        `,
        [
          uuidv4(),
          userId,
          account.initialBalance,
          account.cashBalance,
          JSON.stringify({ source: 'auto_init' }),
        ],
      );
      return account;
    }

    const selected = await client.query<TradingAccountRow>(
      'SELECT * FROM trading_accounts WHERE user_id = $1 FOR UPDATE',
      [userId],
    );

    return toTradingAccount(selected.rows[0]!);
  }
}
