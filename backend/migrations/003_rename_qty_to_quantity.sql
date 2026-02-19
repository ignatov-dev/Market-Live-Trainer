DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'positions'
      AND column_name = 'qty'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'positions'
      AND column_name = 'quantity'
  ) THEN
    ALTER TABLE positions RENAME COLUMN qty TO quantity;
  END IF;
END $$;

ALTER TABLE positions
ADD COLUMN IF NOT EXISTS quantity NUMERIC(18, 8);

UPDATE positions
SET quantity = 1
WHERE quantity IS NULL;

ALTER TABLE positions
ALTER COLUMN quantity SET DEFAULT 1,
ALTER COLUMN quantity SET NOT NULL;

ALTER TABLE positions
DROP CONSTRAINT IF EXISTS positions_qty_positive;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'positions_quantity_positive'
  ) THEN
    ALTER TABLE positions
    ADD CONSTRAINT positions_quantity_positive CHECK (quantity > 0);
  END IF;
END $$;
