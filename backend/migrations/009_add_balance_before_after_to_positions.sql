ALTER TABLE positions
  ADD COLUMN balance_before NUMERIC(18,8),
  ADD COLUMN balance_after  NUMERIC(18,8);
