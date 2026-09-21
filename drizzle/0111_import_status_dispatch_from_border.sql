-- Import Tracking: a file dispatched from the border is IN PROGRESS.
--
-- Clearing Status on the Import form is derived from the file's dates (a
-- statusMap, applied on screen and re-enforced when the file is saved). Until
-- now only the quittance date or the border-warehouse arrival moved a file out
-- of IN TRANSIT; entering Dispatch From Border left it IN TRANSIT.
--
-- The new rule is added AFTER the existing ones, so it never overrides them:
--   CANCELLED (cancelled_date)                      → first, always wins
--   CLEARING COMPLETED (quittance + dispatch/deliver)
--   IN PROGRESS (quittance date)
--   IN PROGRESS (border warehouse arrival)
--   IN PROGRESS (dispatch from border)              ← new
--   otherwise IN TRANSIT
--
-- The status is found by NAME, not by id, as the other rules' ids were seeded.

UPDATE "master_page_accordion_field_t" f
SET "derive" = jsonb_set(
      f."derive",
      '{rules}',
      (f."derive" -> 'rules') || jsonb_build_array(
        jsonb_build_object(
          'when', jsonb_build_object('field', 'dispatch_from_border', 'truthy', true),
          'value', (SELECT cs."id" FROM "clearing_status_master_t" cs
                     WHERE upper(trim(cs."clearing_status")) = 'IN PROGRESS'
                     ORDER BY cs."id" LIMIT 1)
        )
      )
    ),
    "updated_at" = now()
FROM "master_page_accordion_t" a
JOIN "master_page_t" p ON p."id" = a."page_id"
WHERE f."accordion_id" = a."id"
  AND p."slug" = 'import'
  AND f."name" = 'clearing_status'
  AND f."derive" ->> 'kind' = 'statusMap'
  AND EXISTS (SELECT 1 FROM "clearing_status_master_t" cs WHERE upper(trim(cs."clearing_status")) = 'IN PROGRESS')
  -- Idempotent: not if the rule is already there.
  AND NOT (f."derive" -> 'rules') @> '[{"when": {"field": "dispatch_from_border"}}]'::jsonb;
--> statement-breakpoint

-- Files that ALREADY have a Dispatch From Border date would otherwise stay
-- IN TRANSIT until someone next saves them. Only files the rules would now put
-- in IN PROGRESS are touched: still IN TRANSIT (or unset), not cancelled.
UPDATE "imports_t" i
SET "clearing_status" = (SELECT cs."id" FROM "clearing_status_master_t" cs
                          WHERE upper(trim(cs."clearing_status")) = 'IN PROGRESS'
                          ORDER BY cs."id" LIMIT 1),
    "updated_at" = now()
WHERE i."display" = 'Y'
  AND i."dispatch_from_border" IS NOT NULL
  AND i."cancelled_date" IS NULL
  AND (i."clearing_status" IS NULL OR i."clearing_status" IN (
        SELECT cs."id" FROM "clearing_status_master_t" cs WHERE upper(trim(cs."clearing_status")) = 'IN TRANSIT'))
  AND EXISTS (SELECT 1 FROM "clearing_status_master_t" cs WHERE upper(trim(cs."clearing_status")) = 'IN PROGRESS');
