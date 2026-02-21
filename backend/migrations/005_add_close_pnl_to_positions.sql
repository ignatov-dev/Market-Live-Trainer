ALTER TABLE positions
ADD COLUMN IF NOT EXISTS close_pnl NUMERIC(18, 8);

UPDATE positions
SET close_pnl = (
  (close_price - entry_price)
  * quantity
  * (CASE WHEN side = 'long' THEN 1 ELSE -1 END)
  - (close_price * quantity * 0.0004)
)
WHERE status = 'closed'
  AND close_price IS NOT NULL
  AND close_pnl IS NULL;

ALTER TABLE positions
DROP CONSTRAINT IF EXISTS close_fields_match_status;

ALTER TABLE positions
ADD CONSTRAINT close_fields_match_status CHECK (
  (status = 'open' AND close_price IS NULL AND close_reason IS NULL AND closed_at IS NULL AND close_pnl IS NULL)
  OR
  (status = 'closed' AND close_price IS NOT NULL AND close_reason IS NOT NULL AND closed_at IS NOT NULL AND close_pnl IS NOT NULL)
);
