-- §2 step 3 — File Cancellation (Tracking Management → File Cancellation).
--
-- Cancelling an Import, Export or Local file sets its clearing status to
-- CANCELLED and records why (cancellation_reason_id, 0093). This adds WHEN and
-- BY WHOM, which the screen's list and the tracking remarks both show, and the
-- menu the screen hangs off. See src/db/queries/fileCancellation.ts.

ALTER TABLE "imports_t"
  ADD COLUMN IF NOT EXISTS "cancelled_date" date,
  ADD COLUMN IF NOT EXISTS "cancelled_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "exports_t"
  ADD COLUMN IF NOT EXISTS "cancelled_date" date,
  ADD COLUMN IF NOT EXISTS "cancelled_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "locals_t"
  ADD COLUMN IF NOT EXISTS "cancelled_date" date,
  ADD COLUMN IF NOT EXISTS "cancelled_by" integer REFERENCES "users_t"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- Files cancelled before this screen existed (status set by hand on the
-- tracking form) have no date; their last update is the best evidence of when.
UPDATE "imports_t" f SET "cancelled_date" = f."updated_at"::date
FROM "clearing_status_master_t" cs
WHERE cs."id" = f."clearing_status" AND upper(trim(cs."clearing_status")) = 'CANCELLED'
  AND f."cancelled_date" IS NULL;
--> statement-breakpoint

UPDATE "exports_t" f SET "cancelled_date" = f."updated_at"::date
FROM "clearing_status_master_t" cs
WHERE cs."id" = f."clearing_status" AND upper(trim(cs."clearing_status")) = 'CANCELLED'
  AND f."cancelled_date" IS NULL;
--> statement-breakpoint

UPDATE "locals_t" f SET "cancelled_date" = f."updated_at"::date
FROM "clearing_status_master_t" cs
WHERE cs."id" = f."clearing_status" AND upper(trim(cs."clearing_status")) = 'CANCELLED'
  AND f."cancelled_date" IS NULL;
--> statement-breakpoint

INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 41, 1, 'File Cancellation', '/tracking/file-cancellation', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Tracking Management' AND p."menu_level" = 0
  AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/tracking/file-cancellation');
--> statement-breakpoint

-- §4.7 — the Super Admin gets the grant; other roles through Role Menu Mapping.
-- Cancelling is gated on can_edit.
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve", "can_export")
SELECT 1, m."id", true, true, true, true, true, true
FROM "menu_master_t" m
WHERE m."url" = '/tracking/file-cancellation'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_mapping_t" r WHERE r."role_id" = 1 AND r."menu_id" = m."id"
  );
