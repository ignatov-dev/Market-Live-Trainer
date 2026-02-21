CREATE TABLE IF NOT EXISTS trading_accounts (
  user_id TEXT PRIMARY KEY,
  initial_balance NUMERIC(18, 8) NOT NULL DEFAULT 10000,
  cash_balance NUMERIC(18, 8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trading_accounts_initial_positive CHECK (initial_balance > 0)
);

CREATE TABLE IF NOT EXISTS account_ledger (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('init', 'open_fee', 'close_pnl', 'adjustment')),
  amount NUMERIC(18, 8) NOT NULL,
  balance_after NUMERIC(18, 8) NOT NULL,
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_account_ledger_user_created
  ON account_ledger(user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_set_updated_at_trading_accounts ON trading_accounts;
CREATE TRIGGER trg_set_updated_at_trading_accounts
BEFORE UPDATE ON trading_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

WITH user_balances AS (
  SELECT
    p.user_id,
    10000::NUMERIC(18, 8) AS initial_balance,
    (
      10000::NUMERIC(18, 8)
      - COALESCE(SUM(p.entry_price * p.quantity * 0.0004), 0)
      + COALESCE(SUM(CASE WHEN p.status = 'closed' THEN p.close_pnl ELSE 0 END), 0)
    )::NUMERIC(18, 8) AS cash_balance
  FROM positions p
  GROUP BY p.user_id
)
INSERT INTO trading_accounts (user_id, initial_balance, cash_balance)
SELECT
  ub.user_id,
  ub.initial_balance,
  ub.cash_balance
FROM user_balances ub
ON CONFLICT (user_id) DO NOTHING;
