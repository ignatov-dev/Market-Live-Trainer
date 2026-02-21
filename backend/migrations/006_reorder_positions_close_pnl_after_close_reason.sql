DO $$
DECLARE
  close_reason_position INTEGER;
  close_pnl_position INTEGER;
BEGIN
  SELECT ordinal_position
  INTO close_reason_position
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'positions'
    AND column_name = 'close_reason';

  SELECT ordinal_position
  INTO close_pnl_position
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'positions'
    AND column_name = 'close_pnl';

  IF close_reason_position IS NULL OR close_pnl_position IS NULL THEN
    RAISE NOTICE 'Skipping reorder: positions.close_reason or positions.close_pnl does not exist.';
    RETURN;
  END IF;

  IF close_pnl_position = close_reason_position + 1 THEN
    RAISE NOTICE 'Skipping reorder: close_pnl is already right after close_reason.';
    RETURN;
  END IF;

  CREATE TABLE positions_reordered (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    quantity NUMERIC(18, 8) NOT NULL DEFAULT 1,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('long', 'short')),
    entry_price NUMERIC(18, 8) NOT NULL CHECK (entry_price > 0),
    take_profit NUMERIC(18, 8),
    stop_loss NUMERIC(18, 8),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    close_price NUMERIC(18, 8),
    close_reason TEXT CHECK (close_reason IN ('take_profit', 'stop_loss', 'manual', 'system')),
    close_pnl NUMERIC(18, 8),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    CONSTRAINT positions_quantity_positive CHECK (quantity > 0),
    CONSTRAINT close_fields_match_status CHECK (
      (status = 'open' AND close_price IS NULL AND close_reason IS NULL AND closed_at IS NULL AND close_pnl IS NULL)
      OR
      (status = 'closed' AND close_price IS NOT NULL AND close_reason IS NOT NULL AND closed_at IS NOT NULL AND close_pnl IS NOT NULL)
    )
  );

  INSERT INTO positions_reordered (
    id,
    user_id,
    quantity,
    symbol,
    side,
    entry_price,
    take_profit,
    stop_loss,
    status,
    close_price,
    close_reason,
    close_pnl,
    created_at,
    updated_at,
    closed_at
  )
  SELECT
    id,
    user_id,
    quantity,
    symbol,
    side,
    entry_price,
    take_profit,
    stop_loss,
    status,
    close_price,
    close_reason,
    close_pnl,
    created_at,
    updated_at,
    closed_at
  FROM positions;

  DROP TABLE positions;
  ALTER TABLE positions_reordered RENAME TO positions;

  CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id);
  CREATE INDEX IF NOT EXISTS idx_positions_symbol_status ON positions(symbol, status);
  CREATE INDEX IF NOT EXISTS idx_positions_open ON positions(status) WHERE status = 'open';

  DROP TRIGGER IF EXISTS trg_set_updated_at_positions ON positions;
  CREATE TRIGGER trg_set_updated_at_positions
  BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;
