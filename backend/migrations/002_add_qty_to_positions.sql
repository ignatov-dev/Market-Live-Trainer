ALTER TABLE positions
ADD COLUMN IF NOT EXISTS qty NUMERIC(18, 8);

UPDATE positions
SET qty = 1
WHERE qty IS NULL;

ALTER TABLE positions
ALTER COLUMN qty SET DEFAULT 1,
ALTER COLUMN qty SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'positions_qty_positive'
  ) THEN
    ALTER TABLE positions
    ADD CONSTRAINT positions_qty_positive CHECK (qty > 0);
  END IF;
END $$;
