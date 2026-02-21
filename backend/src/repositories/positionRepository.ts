import type { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type {
  ClosePositionInput,
  CreatePositionInput,
  Position,
  TradingAccount,
} from '../types/domain.js';

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
  quantity: string;
  entry_price: string;
  take_profit: string | null;
  stop_loss: string | null;
  status: 'open' | 'closed';
  close_price: string | null;
  close_pnl: string | null;
  close_reason: 'take_profit' | 'stop_loss' | 'manual' | 'system' | null;
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

const FEE_RATE = 0.0004;
const DEFAULT_INITIAL_BALANCE = 10000;

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

export class PositionRepository {
  constructor(private readonly db: Pool) {}

  async createPosition(input: CreatePositionInput): Promise<Position> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const currentAccount = await this.ensureTradingAccount(client, input.userId);
      const openFee = input.entryPrice * input.quantity * FEE_RATE;
      if (!Number.isFinite(openFee) || openFee < 0) {
        throw new Error('Invalid open fee.');
      }

      if (currentAccount.cashBalance < openFee) {
        throw new Error('Insufficient account balance.');
      }

      const updatedAccountResult = await client.query<TradingAccountRow>(
        `
        UPDATE trading_accounts
        SET cash_balance = cash_balance - $2
        WHERE user_id = $1
        RETURNING *
        `,
        [input.userId, openFee],
      );
      const updatedAccount = toTradingAccount(updatedAccountResult.rows[0]!);

      const positionResult = await client.query<PositionRow>(
        `
        INSERT INTO positions (
          id, user_id, symbol, side, quantity, entry_price, take_profit, stop_loss
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
          uuidv4(),
          input.userId,
          input.symbol,
          input.side,
          input.quantity,
          input.entryPrice,
          input.takeProfit,
          input.stopLoss,
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
          input.userId,
          -openFee,
          updatedAccount.cashBalance,
          position.id,
          JSON.stringify({ symbol: input.symbol }),
        ],
      );

      await client.query('COMMIT');
      return position;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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

    return toPosition(result.rows[0]!);
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

    return toPosition(result.rows[0]!);
  }

  async closePositionIfOpen(positionId: string, input: ClosePositionInput): Promise<Position | null> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const lockParams: unknown[] = [positionId];
      let lockQuery = `
        SELECT *
        FROM positions
        WHERE id = $1
          AND status = 'open'
        FOR UPDATE
      `;

      if (input.userId) {
        lockParams.push(input.userId);
        lockQuery = `
          SELECT *
          FROM positions
          WHERE id = $1
            AND user_id = $2
            AND status = 'open'
          FOR UPDATE
        `;
      }

      const locked = await client.query<PositionRow>(lockQuery, lockParams);
      if (locked.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const opened = toPosition(locked.rows[0]!);
      const closeParams: unknown[] = [positionId, input.closePrice, input.closeReason, input.closedAt];
      let closeQuery = `
        UPDATE positions
        SET
          status = 'closed',
          close_price = $2,
          close_reason = $3,
          closed_at = $4,
          close_pnl = (
            ($2 - entry_price)
            * quantity
            * (CASE WHEN side = 'long' THEN 1 ELSE -1 END)
            - ($2 * quantity * ${FEE_RATE})
          )
        WHERE id = $1
          AND status = 'open'
      `;

      if (input.userId) {
        closeParams.push(input.userId);
        closeQuery += ` AND user_id = $${closeParams.length}`;
      }

      closeQuery += ' RETURNING *';

      const closedResult = await client.query<PositionRow>(closeQuery, closeParams);
      if (closedResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const closed = toPosition(closedResult.rows[0]!);
      const closePnl = Number(closed.closePnl);
      const safeClosePnl = Number.isFinite(closePnl) ? closePnl : 0;

      await this.ensureTradingAccount(client, opened.userId);
      const updatedAccountResult = await client.query<TradingAccountRow>(
        `
        UPDATE trading_accounts
        SET cash_balance = cash_balance + $2
        WHERE user_id = $1
        RETURNING *
        `,
        [opened.userId, safeClosePnl],
      );
      const updatedAccount = toTradingAccount(updatedAccountResult.rows[0]!);

      await client.query(
        `
        INSERT INTO account_ledger (
          id, user_id, entry_type, amount, balance_after, position_id, metadata
        ) VALUES ($1, $2, 'close_pnl', $3, $4, $5, $6::jsonb)
        `,
        [
          uuidv4(),
          opened.userId,
          safeClosePnl,
          updatedAccount.cashBalance,
          positionId,
          JSON.stringify({ reason: input.closeReason }),
        ],
      );

      await client.query('COMMIT');
      return closed;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getTradingAccount(userId: string): Promise<TradingAccount | null> {
    const result = await this.db.query<TradingAccountRow>(
      'SELECT * FROM trading_accounts WHERE user_id = $1',
      [userId],
    );
    if (result.rowCount === 0) {
      return null;
    }
    return toTradingAccount(result.rows[0]!);
  }

  async getOrCreateTradingAccount(userId: string): Promise<TradingAccount> {
    const existing = await this.getTradingAccount(userId);
    if (existing) {
      return existing;
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const account = await this.ensureTradingAccount(client, userId);
      await client.query('COMMIT');
      return account;
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

  async resetUserSession(userId: string): Promise<TradingAccount> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const accountBeforeReset = await this.ensureTradingAccount(client, userId);
      const resetBalance =
        Number.isFinite(accountBeforeReset.initialBalance) && accountBeforeReset.initialBalance > 0
          ? accountBeforeReset.initialBalance
          : DEFAULT_INITIAL_BALANCE;

      await client.query(
        'DELETE FROM account_ledger WHERE user_id = $1',
        [userId],
      );
      await client.query(
        'DELETE FROM positions WHERE user_id = $1',
        [userId],
      );

      const resetAccountResult = await client.query<TradingAccountRow>(
        `
        INSERT INTO trading_accounts (user_id, initial_balance, cash_balance)
        VALUES ($1, $2, $2)
        ON CONFLICT (user_id) DO UPDATE
        SET
          initial_balance = EXCLUDED.initial_balance,
          cash_balance = EXCLUDED.cash_balance
        RETURNING *
        `,
        [userId, resetBalance],
      );
      const resetAccount = toTradingAccount(resetAccountResult.rows[0]!);

      await client.query(
        `
        INSERT INTO account_ledger (
          id, user_id, entry_type, amount, balance_after, metadata
        ) VALUES ($1, $2, 'init', $3, $4, $5::jsonb)
        `,
        [
          uuidv4(),
          userId,
          resetAccount.initialBalance,
          resetAccount.cashBalance,
          JSON.stringify({ source: 'session_reset' }),
        ],
      );

      await client.query('COMMIT');
      return resetAccount;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
