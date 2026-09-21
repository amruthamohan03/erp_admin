-- File Cancellation, round two.
--
-- 1. A cancelled IMPORT file showed "CLEARING COMPLETED" again the moment it was
--    opened. Import Tracking's Clearing Status is a derived field (a statusMap
--    over the dates: quittance + dispatch → CLEARING COMPLETED, …), and a pure
--    derive is recomputed on the screen AND re-enforced by the save route. So it
--    overwrote the stored CANCELLED on display, and the next save of that file
--    would have quietly un-cancelled it in the database too.
--
--    The fix is configuration, not code: the derive's FIRST rule now says a file
--    with a cancellation date is CANCELLED, before any date rule is looked at.
--    Export and Local have no derive on this field, so they were never affected.
--
-- 2. payment_recollection_t — money already PAID on a file that is then
--    cancelled. A payment request no longer blocks a cancellation: the operator
--    sees the requests (status and amount) and confirms, and each paid one opens
--    a recollection that the Cancelled Files list tracks until it is recovered
--    or written off. The payment requests themselves are never changed.

UPDATE "master_page_accordion_field_t" f
SET "derive" = jsonb_set(
      f."derive",
      '{rules}',
      jsonb_build_array(
        jsonb_build_object(
          'when', jsonb_build_object('field', 'cancelled_date', 'truthy', true),
          'value', (SELECT cs."id" FROM "clearing_status_master_t" cs
                     WHERE upper(trim(cs."clearing_status")) = 'CANCELLED'
                     ORDER BY cs."id" LIMIT 1)
        )
      ) || (f."derive" -> 'rules')
    ),
    "updated_at" = now()
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE f."accordion_id" = a."id"
  AND f."name" = 'clearing_status'
  AND f."derive" ->> 'kind' = 'statusMap'
  AND EXISTS (SELECT 1 FROM "clearing_status_master_t" cs WHERE upper(trim(cs."clearing_status")) = 'CANCELLED')
  -- Idempotent: not if the cancellation rule is already there.
  AND NOT (f."derive" -> 'rules') @> '[{"when": {"field": "cancelled_date"}}]'::jsonb;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payment_recollection_t" (
  "id"                 serial PRIMARY KEY,
  "payment_request_id" integer NOT NULL REFERENCES "payment_request_t"("id") ON DELETE CASCADE,
  "file_kind"          varchar(10) NOT NULL CHECK ("file_kind" IN ('import', 'export', 'local')),
  "file_id"            integer NOT NULL,
  "file_ref"           varchar(100),
  "amount"             numeric(15,2) NOT NULL DEFAULT 0,
  "currency_id"        integer,
  "status"             varchar(20) NOT NULL DEFAULT 'pending'
                         CHECK ("status" IN ('pending', 'recovered', 'written_off')),
  "recovered_amount"   numeric(15,2),
  "recovered_date"     date,
  "note"               text,
  "recovered_by"       integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_by"         integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at"         timestamp NOT NULL DEFAULT now(),
  "updated_at"         timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_recollection_file" ON "payment_recollection_t" ("file_kind", "file_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_recollection_request" ON "payment_recollection_t" ("payment_request_id");
