-- The Import License Dashboard had no menu row, so the page existed at
-- /licenses/dashboard with no way to navigate to it (§7.2).
--
-- `src/db/seed/menus.ts` has defined this entry for some time, but a seed only
-- runs on a fresh database. Migration 0115 created the whole EXPORT branch —
-- Create / Dashboard / list — which is why Export License has its dashboard in
-- the sidebar and Import License does not: under "Import License" the live tree
-- carries only "Licenses" (/licenses) at order 3, the slot the seed reserves
-- for the list, with orders 1 and 2 empty.
--
-- This inserts the order-2 entry, following 0115's pattern exactly. Guarded on
-- the url, so a database seeded with it is untouched and this is safe to re-run.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 2, 1, 'Import License Dashboard', '/licenses/dashboard', '', 'Y'
  FROM "menu_master_t" p
 WHERE p."menu_name" = 'Import License' AND p."menu_level" = 0
   AND NOT EXISTS (
     SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/licenses/dashboard'
   );
--> statement-breakpoint

-- §4.7 — the menu URL IS the permission resource, so the row alone does not
-- make the screen reachable. Granted to every role that can already view the
-- import licence list: whoever may read those records may read their figures.
-- The dashboard is read-only, so only can_view is implied; the rest are carried
-- across from that role's rights on the list rather than invented here.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       true,
       false, false, false, false,
       false, false,
       r."can_export", r."can_import", r."can_print",
       false, false, false
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" lst ON lst."id" = r."menu_id" AND lst."url" = '/licenses'
  JOIN "menu_master_t" d ON d."url" = '/licenses/dashboard'
 WHERE r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
