CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  entry_price NUMERIC(18, 8) NOT NULL CHECK (entry_price > 0),
  take_profit NUMERIC(18, 8),
  stop_loss NUMERIC(18, 8),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  close_price NUMERIC(18, 8),
  close_reason TEXT CHECK (close_reason IN ('take_profit', 'stop_loss', 'manual', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  CONSTRAINT close_fields_match_status CHECK (
    (status = 'open' AND close_price IS NULL AND close_reason IS NULL AND closed_at IS NULL)
    OR
    (status = 'closed' AND close_price IS NOT NULL AND close_reason IS NOT NULL AND closed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_symbol_status ON positions(symbol, status);
CREATE INDEX IF NOT EXISTS idx_positions_open ON positions(status) WHERE status = 'open';

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_positions ON positions;
CREATE TRIGGER trg_set_updated_at_positions
BEFORE UPDATE ON positions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
