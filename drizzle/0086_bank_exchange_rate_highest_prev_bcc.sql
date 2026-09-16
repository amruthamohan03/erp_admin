-- Bank Exchange Rate — the columns the reference screen actually stores.
--
-- main's saveRates() writes five derived values onto EVERY row of a day, not
-- just the winning one: which bank was highest, what that rate was, the previous
-- day's BCC rate and its date, and the difference between them. The board and
-- the history grid both read them back.
--
-- They are STORED rather than recomputed on read, and that is deliberate: the
-- difference is "highest today versus the last published BCC", and the last
-- published BCC moves as older days are entered or corrected. Recomputing would
-- silently rewrite what a day's comparison said at the time it was saved, which
-- is the number an operator acted on. A saved comparison is a record, not a view.

ALTER TABLE "bank_exchange_rate_t"
  ADD COLUMN IF NOT EXISTS "highest_bank_id"   integer REFERENCES "banklist_master_t"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "highest_bank_rate" numeric(10, 4),
  ADD COLUMN IF NOT EXISTS "prev_bcc_rate"     numeric(10, 4),
  ADD COLUMN IF NOT EXISTS "prev_bcc_date"     date,
  ADD COLUMN IF NOT EXISTS "rate_difference"   numeric(10, 4);
--> statement-breakpoint

-- Backfill what can be known for days already on file: the highest bank rate of
-- each (currency, date) and which bank held it. `prev_bcc_*` and the difference
-- are left NULL rather than invented — the screen renders a dash for a day with
-- no previous BCC, and a made-up comparison would be indistinguishable from one
-- an operator had actually seen.
WITH winner AS (
  SELECT DISTINCT ON (currency_id, exchange_date)
         currency_id, exchange_date, bank_id, bank_rate
    FROM "bank_exchange_rate_t"
   WHERE display = 'Y' AND bank_rate IS NOT NULL
   ORDER BY currency_id, exchange_date, bank_rate DESC, bank_id
)
UPDATE "bank_exchange_rate_t" r
   SET highest_bank_id   = w.bank_id,
       highest_bank_rate = w.bank_rate
  FROM winner w
 WHERE r.currency_id = w.currency_id
   AND r.exchange_date = w.exchange_date
   AND r.display = 'Y'
   AND r.highest_bank_id IS NULL;
--> statement-breakpoint

-- The DGI / e-MCF published rate cache.
--
-- main resolves the BCC rate as: this table for the requested date, then a LIVE
-- e-MCF call but ONLY when the date is today (DGI answers with the current rate,
-- so back-dating it would file today's number against an older day), then
-- nothing — the field stays empty and says so rather than showing a stale rate
-- dressed up as a live one.
CREATE TABLE IF NOT EXISTS "dgi_currency_rate_t" (
  "id"            serial PRIMARY KEY,
  "currency_code" varchar(10) NOT NULL,
  "rate"          numeric(14, 4) NOT NULL,
  "rate_date"     date NOT NULL,
  "created_at"    timestamp NOT NULL DEFAULT now(),
  "updated_at"    timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- One cached rate per currency per day — the conflict target the upsert needs,
-- standing in for main's `ON DUPLICATE KEY UPDATE`.
--
-- On the plain columns rather than `UPPER(currency_code)`: ON CONFLICT can only
-- name an expression index if the statement repeats the expression exactly, and
-- Drizzle's onConflictDoUpdate takes columns. Case-insensitivity is kept as a
-- write-side invariant instead — the route upper-cases every code before it
-- stores one, in the single place that writes this table — plus the CHECK below
-- so a hand-written INSERT cannot slip a lower-case code past it.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_dgi_currency_rate_t_code_date"
  ON "dgi_currency_rate_t" ("currency_code", "rate_date");
--> statement-breakpoint

ALTER TABLE "dgi_currency_rate_t"
  ADD CONSTRAINT "dgi_currency_rate_t_code_upper_ck"
  CHECK ("currency_code" = UPPER("currency_code"));
