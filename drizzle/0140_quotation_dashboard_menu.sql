-- §4.29 — the Quotation dashboard, and the menu entry that reaches it.
--
-- The page lives at /quotations/dashboard. §4.7 makes the menu URL the
-- permission resource, so without a row here there is no link AND no grant —
-- the state the Import Licence Dashboard was found in (migration 0138).
--
-- Order 44, immediately before "Invoice Quotation" at 45, so the dashboard
-- reads first in the group the way every other module's does.
--
-- Guarded on the url, so a database seeded with it is untouched and this is
-- safe to re-run.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 44, 1, 'Quotation Dashboard', '/quotations/dashboard', '', 'Y'
  FROM "menu_master_t" p
 WHERE p."menu_name" = 'Quotation Management' AND p."menu_level" = 0
   AND NOT EXISTS (
     SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/quotations/dashboard'
   );
--> statement-breakpoint

-- Granted to every role that can already view the quotation list: whoever may
-- read those records may read their figures. The dashboard is read-only, so
-- only can_view is implied; export/print carry across from that role's rights
-- on the list rather than being invented here.
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
  JOIN "menu_master_t" lst ON lst."id" = r."menu_id" AND lst."url" = '/quotations'
  JOIN "menu_master_t" d ON d."url" = '/quotations/dashboard'
 WHERE r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
