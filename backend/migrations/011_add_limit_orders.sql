CREATE TABLE IF NOT EXISTS limit_orders (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity NUMERIC(18, 8) NOT NULL CHECK (quantity > 0),
  limit_price NUMERIC(18, 8) NOT NULL CHECK (limit_price > 0),
  take_profit NUMERIC(18, 8),
  stop_loss NUMERIC(18, 8),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'canceled')),
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  filled_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT limit_order_status_fields CHECK (
    (status = 'pending' AND filled_at IS NULL AND canceled_at IS NULL)
    OR
    (status = 'filled' AND filled_at IS NOT NULL AND canceled_at IS NULL)
    OR
    (status = 'canceled' AND canceled_at IS NOT NULL AND filled_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_limit_orders_user ON limit_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_limit_orders_symbol_status ON limit_orders(symbol, status);
CREATE INDEX IF NOT EXISTS idx_limit_orders_pending ON limit_orders(status) WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_set_updated_at_limit_orders ON limit_orders;
CREATE TRIGGER trg_set_updated_at_limit_orders
BEFORE UPDATE ON limit_orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
