-- Payment Request — re-submission of a rejected request (§2 step 6, §4.6).
--
-- A rejection is a hand-back, not an ending: the requester corrects the request
-- and sends it round again. Doing that clears all five stage flags back to
-- pending, which by itself would erase every trace that the round-trip ever
-- happened — the rejection reason, its stage, and its timestamp all live in the
-- columns being reset.
--
-- These three columns are the record that survives it. Together with the audit
-- log (§4.28), which keeps the full before/after of each reset, they answer the
-- question an approver asks when a familiar request reappears: "has this been
-- through here before, and when?"
--
-- `resubmit_count` is NOT NULL DEFAULT 0 because "never re-submitted" is a
-- number, not an unknown — a request on its first pass has been round zero
-- times. The two stamps stay nullable for the same reason in reverse: there is
-- no date on which a request that was never re-submitted was re-submitted.

ALTER TABLE "payment_request_t"
  ADD COLUMN IF NOT EXISTS "resubmitted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "resubmitted_by" integer,
  ADD COLUMN IF NOT EXISTS "resubmit_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- ON DELETE SET NULL, matching every other actor reference on this table: a
-- user record going away must not take the payment history with it, and "who"
-- is answered by the audit log when the name is gone.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_request_t_resubmitted_by_fkey'
  ) THEN
    ALTER TABLE "payment_request_t"
      ADD CONSTRAINT "payment_request_t_resubmitted_by_fkey"
      FOREIGN KEY ("resubmitted_by") REFERENCES "users_t"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

-- The export filters on the request date, and the list already orders by it.
-- Without an index a date-range export scans the whole table, which is fine at
-- today's row count and is not once this has been live for a year.
CREATE INDEX IF NOT EXISTS "idx_payment_request_t_created_at"
  ON "payment_request_t" ("created_at");
