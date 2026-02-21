CREATE OR REPLACE FUNCTION set_close_pnl() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'closed' THEN
    IF NEW.close_price IS NULL THEN
      NEW.close_pnl = NULL;
    ELSE
      NEW.close_pnl = (
        (NEW.close_price - NEW.entry_price)
        * NEW.quantity
        * (CASE WHEN NEW.side = 'long' THEN 1 ELSE -1 END)
        - (NEW.close_price * NEW.quantity * 0.0004)
      );
    END IF;
  ELSE
    NEW.close_pnl = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_close_pnl_positions ON positions;
CREATE TRIGGER trg_set_close_pnl_positions
BEFORE INSERT OR UPDATE OF status, close_price, side, quantity, entry_price
ON positions
FOR EACH ROW EXECUTE FUNCTION set_close_pnl();

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
