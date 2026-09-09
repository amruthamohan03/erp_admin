-- 0073 — a menu and permissions for the DRC Public Holidays master.
--
-- `drc_holidays_t` has existed since the KPI port and is read by
-- `getHolidaySet` to exclude non-working days from the Import/Export delay
-- figures — but nothing could edit it. The DRC republishes its movable feasts
-- every year, so the table had to be maintained by hand in the database, which
-- §4.1 exists to prevent and §7.2 forbids. This gives it the screen.
--
-- No schema change: the table, its index and its seeded rows are already there.

-- ── The menu entry, under Masters (id 174, the level-0 parent) ─────────────
-- `menu_id` is the parent FK. Ordered after Group Companies (203), the current
-- last child.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 204, 1, 'DRC Public Holidays', '/masters/drc-holidays', '', 'Y'
  FROM "menu_master_t" p
 WHERE p."menu_name" = 'Masters' AND p."menu_level" = 0
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/drc-holidays');

-- ── Super Admin can use it ────────────────────────────────────────────────
-- §4.7 — the menu URL IS the permission resource, so without a mapping row the
-- screen is denied to everyone, including the role the model is bootstrapped on.
--
-- Insert AND update, not insert-only: migration 0055 granted the audit menu with
-- a bare `NOT EXISTS` guard, and on any database that already had a row for that
-- role+menu the grant was silently skipped and the screen 403'd for months
-- (repaired in 0071). Same shape as every other master menu role 1 holds.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT 1, m."id", true, true, true, true, true, true, true, true, true, true, true, true, true
  FROM "menu_master_t" m
 WHERE m."url" = '/masters/drc-holidays'
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = 1 AND x."menu_id" = m."id");

UPDATE "role_menu_mapping_t" x
   SET "can_view" = true, "can_add" = true, "can_edit" = true, "can_delete" = true,
       "can_export" = true, "can_print" = true, "updated_at" = now()
  FROM "menu_master_t" m
 WHERE m."id" = x."menu_id"
   AND m."url" = '/masters/drc-holidays'
   AND x."role_id" = 1
   AND (x."can_view" IS NOT TRUE OR x."can_add" IS NOT TRUE
     OR x."can_edit" IS NOT TRUE OR x."can_delete" IS NOT TRUE);
