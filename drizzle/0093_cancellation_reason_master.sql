-- Cancelling a tracking file, and why (§4.1).
--
-- Cancelling an Import or Export already works — `clearing_status` is a field on
-- both transaction pages, and CANCELLED is row 7 of clearing_status_master_t.
-- Two things were missing:
--   * WHY a file was cancelled was nowhere. An operator looking at a cancelled
--     consignment months later, deciding what to bill for it, had the fact and
--     not the reason.
--   * LOCAL files could not be cancelled at all — locals_t has no status column,
--     so the one tracking table with no lifecycle was also the one that could
--     never be closed off.
--
-- The reasons are a master, not an enum, because which reasons a DRC clearing
-- operation recognises is exactly the kind of list a business analyst changes
-- (§4.1) — and §10 is explicit that a new status/reason list is a master table.

CREATE TABLE IF NOT EXISTS "cancellation_reason_master_t" (
  "id"          serial PRIMARY KEY,
  "reason_name" varchar(200) NOT NULL,
  "display"     varchar(1) NOT NULL DEFAULT 'Y',
  "created_by"  integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by"  integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at"  timestamp NOT NULL DEFAULT now(),
  "updated_at"  timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Case- and whitespace-insensitive, partial on display, matching every other
-- master name in this schema (0091, 0092).
CREATE UNIQUE INDEX IF NOT EXISTS "cancellation_reason_master_t_name_uq"
  ON "cancellation_reason_master_t" (UPPER(BTRIM("reason_name")))
  WHERE "display" = 'Y';
--> statement-breakpoint

-- A starter set, so the feature works the moment it ships rather than presenting
-- an empty dropdown that blocks the first cancellation. Deliberately generic —
-- these are guesses at a DRC clearing operation's vocabulary, and the whole
-- point of a master is that an operator corrects them without a deploy.
INSERT INTO "cancellation_reason_master_t" ("reason_name")
SELECT r FROM (VALUES
  ('Client withdrew the consignment'),
  ('Customs refused entry'),
  ('Duplicate file'),
  ('Created in error'),
  ('Goods not shipped'),
  ('Superseded by a new file')
) AS v(r)
WHERE NOT EXISTS (SELECT 1 FROM "cancellation_reason_master_t");
--> statement-breakpoint

-- Local files get the same lifecycle column imports and exports already have,
-- pointing at the same master — one mechanism for all three rather than a
-- private "cancelled" flag that reports differently (§4.10).
ALTER TABLE "locals_t"
  ADD COLUMN IF NOT EXISTS "clearing_status" integer
    REFERENCES "clearing_status_master_t"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- The reason, on all three. Nullable because it only means anything once a file
-- is cancelled; ON DELETE SET NULL so retiring a reason never blocks reading the
-- file that used it.
ALTER TABLE "imports_t"
  ADD COLUMN IF NOT EXISTS "cancellation_reason_id" integer
    REFERENCES "cancellation_reason_master_t"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "exports_t"
  ADD COLUMN IF NOT EXISTS "cancellation_reason_id" integer
    REFERENCES "cancellation_reason_master_t"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "locals_t"
  ADD COLUMN IF NOT EXISTS "cancellation_reason_id" integer
    REFERENCES "cancellation_reason_master_t"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- ── The screens ────────────────────────────────────────────────────────────
-- Reason fields, shown only when the file is actually CANCELLED (§4.12
-- conditions). Asking for a cancellation reason on a live consignment would be
-- noise on every form; `visibleWhen` keeps it out of the way until it applies.
--
-- Appended to the accordion that already holds clearing_status, so the reason
-- sits beside the status that triggers it.
INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required", "options_source",
   "options_label_field", "props", "display_order", "display", "conditions")
SELECT f."accordion_id",
       'cancellation_reason_id',
       'Cancellation Reason',
       'select',
       'f',
       'cancellation-reasons',
       'reason_name',
       '{"colSpan": "5-per-row"}'::jsonb,
       f."display_order" + 1,
       'Y',
       '{"visibleWhen": {"field": "clearing_status", "eq": 7}}'::jsonb
  FROM "master_page_accordion_field_t" f
 WHERE f."name" = 'clearing_status'
   AND NOT EXISTS (
     SELECT 1 FROM "master_page_accordion_field_t" x
      WHERE x."accordion_id" = f."accordion_id"
        AND x."name" = 'cancellation_reason_id'
   );
--> statement-breakpoint

-- Local Tracking has no clearing_status field yet, so it gets both: the status
-- itself and the reason that hangs off it.
INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required", "options_source",
   "options_label_field", "props", "display_order", "display", "conditions")
SELECT a."id", 'clearing_status', 'Clearing Status', 'select', 'f',
       'clearing-statuses', 'clearing_status',
       '{"colSpan": "5-per-row"}'::jsonb,
       COALESCE((SELECT max(x."display_order") FROM "master_page_accordion_field_t" x
                  WHERE x."accordion_id" = a."id"), 0) + 1,
       'Y', NULL
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE p."slug" = 'local' AND a."slug" = 'basic'
   AND NOT EXISTS (
     SELECT 1 FROM "master_page_accordion_field_t" x
      WHERE x."accordion_id" = a."id" AND x."name" = 'clearing_status'
   );
--> statement-breakpoint

INSERT INTO "master_page_accordion_field_t"
  ("accordion_id", "name", "label", "field_type", "required", "options_source",
   "options_label_field", "props", "display_order", "display", "conditions")
SELECT a."id", 'cancellation_reason_id', 'Cancellation Reason', 'select', 'f',
       'cancellation-reasons', 'reason_name',
       '{"colSpan": "5-per-row"}'::jsonb,
       COALESCE((SELECT max(x."display_order") FROM "master_page_accordion_field_t" x
                  WHERE x."accordion_id" = a."id"), 0) + 1,
       'Y',
       '{"visibleWhen": {"field": "clearing_status", "eq": 7}}'::jsonb
  FROM "master_page_accordion_t" a
  JOIN "master_page_t" p ON p."id" = a."page_id"
 WHERE p."slug" = 'local' AND a."slug" = 'basic'
   AND NOT EXISTS (
     SELECT 1 FROM "master_page_accordion_field_t" x
      WHERE x."accordion_id" = a."id" AND x."name" = 'cancellation_reason_id'
   );
--> statement-breakpoint

-- ── The master's own screen ────────────────────────────────────────────────
-- Parent resolved BY NAME and selected FROM the table, so this is a silent
-- no-op on a fresh database where menus have not been seeded yet (the trap 0082
-- hit); seedMenus carries the same row for that case.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 38, 1, 'Cancellation Reason', '/masters/cancellation-reasons', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Masters' AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/cancellation-reasons'
  );
--> statement-breakpoint

INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve")
SELECT 1, m."id", true, true, true, true, true
FROM "menu_master_t" m
WHERE m."url" = '/masters/cancellation-reasons'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_mapping_t" r WHERE r."role_id" = 1 AND r."menu_id" = m."id"
  );
