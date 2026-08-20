-- 0052 — §4.27 / §4.14: delete, restore and permanent delete are three separate
-- permissions, plus the remaining action flags the spec asks role_menu_mapping_t
-- to carry.
--
-- Deliberately NOT backfilled from can_delete. "A user who may hide a record is
-- not thereby allowed to destroy it" — inheriting permanent delete from an
-- existing delete grant would silently hand 101 mappings the power to lose data.
-- Every new flag starts false and is granted explicitly; Super Admin (role 1) is
-- seeded so the feature is reachable on day one.

ALTER TABLE "role_menu_mapping_t"
  ADD COLUMN IF NOT EXISTS "can_restore" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "can_permanent_delete" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "can_export" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "can_import" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "can_print" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "can_view_audit" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "can_export_audit" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "can_manage_settings" boolean DEFAULT false NOT NULL;

-- Super Admin gets the new flags on every menu it already reaches, so an
-- administrator can hand them out from the UI rather than from SQL.
UPDATE "role_menu_mapping_t"
   SET "can_restore" = true,
       "can_permanent_delete" = true,
       "can_export" = true,
       "can_import" = true,
       "can_print" = true,
       "can_view_audit" = true,
       "can_export_audit" = true,
       "can_manage_settings" = true
 WHERE "role_id" = 1;

-- Export and print are read-shaped: anyone who can already view a screen can
-- reasonably produce a document from it, and withholding them would silently
-- break every export button that exists today.
UPDATE "role_menu_mapping_t"
   SET "can_export" = true,
       "can_print" = true
 WHERE "can_view" = true
   AND "can_export" = false;
