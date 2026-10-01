-- The amount exchanged on a day, stored with the day's board.
--
-- It was a transient box on the screen: typed, read against the day's best
-- rate, and gone on refresh. Saving it means the day's record states what the
-- margin was actually calculated on, so the figure can be read back months
-- later instead of being re-derived from memory.
--
-- Stamped on EVERY row of the day, exactly as bcc_rate, highest_bank_rate and
-- rate_difference already are, and read back with max() grouped by date. A
-- day-level value in a per-bank table is a deliberate trade this table already
-- makes: the alternative is a second table joined on every read of a screen
-- whose whole job is one query.
--
-- numeric(18,2): the rates are numeric(10,4), but an amount in francs is a far
-- larger number than a rate — a million-franc exchange is ordinary — and
-- capping it at the rate's precision would refuse real figures.
ALTER TABLE "bank_exchange_rate_t"
  ADD COLUMN IF NOT EXISTS "exchanged_amount" numeric(18, 2);
