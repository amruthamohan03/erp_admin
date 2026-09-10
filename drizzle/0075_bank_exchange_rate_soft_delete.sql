-- 0075 — soft delete for bank_exchange_rate_t (§4.27).
--
-- The rate board deletes a whole day's rates at once, and this was one of the
-- eleven tables with no `display` flag, so that button was a real DELETE: an
-- operator clearing "today" by mistake destroyed the row an invoice's CDF→USD
-- conversion had been quoted against, with no Recycle Bin to reach it from.
ALTER TABLE bank_exchange_rate_t
  ADD COLUMN IF NOT EXISTS display varchar(1) NOT NULL DEFAULT 'Y';

-- The uniqueness has to follow the flag with it. The old index covered every
-- row, so once a day was soft-deleted its (bank, currency, date) slot stayed
-- occupied and re-entering that day's rate failed on a row nobody could see.
-- A partial index frees the slot on delete and still forbids two LIVE rates for
-- the same bank on the same day (the pivoted history assumes exactly one).
DROP INDEX IF EXISTS uq_bank_exchange_rate_t_bank_currency_date;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_exchange_rate_t_bank_currency_date
  ON bank_exchange_rate_t (bank_id, currency_id, exchange_date)
  WHERE display = 'Y';
