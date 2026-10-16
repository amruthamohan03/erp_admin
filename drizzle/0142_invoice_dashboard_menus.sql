-- §4.29 — the Export Invoice and Import Invoice dashboards, and the menu
-- entries that reach them.
--
-- The pages live at /export-invoices/dashboard and /import-invoices/dashboard.
-- §4.7 makes the menu URL the permission resource, so without a row here there
-- is no link AND no grant (the state migration 0138 found a dashboard in).
--
-- Orders 1 and 2, ahead of "Export Invoice" (3) and "Import Invoice" (4), so
-- each module's dashboard reads first in its group the way the others do.
--
-- Guarded on the url, so a database seeded with them is untouched and this is
-- safe to re-run.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", s.ord, 1, s.name, s.url, '', 'Y'
  FROM "menu_master_t" p
 CROSS JOIN (VALUES
   ('Export Invoice Dashboard', 1, '/export-invoices/dashboard'),
   ('Import Invoice Dashboard', 2, '/import-invoices/dashboard')
 ) AS s(name, ord, url)
 WHERE p."menu_name" = 'Invoice Management' AND p."menu_level" = 0
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = s.url);
--> statement-breakpoint

-- Granted to every role that can already view the matching invoice list:
-- whoever may read those invoices may read their figures. The dashboard is
-- read-only, so only can_view is implied; export/print carry across from that
-- role's rights on the list rather than being invented here.
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
  JOIN "menu_master_t" lst ON lst."id" = r."menu_id"
  JOIN "menu_master_t" d ON d."url" = lst."url" || '/dashboard'
 WHERE lst."url" IN ('/export-invoices', '/import-invoices')
   AND r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
