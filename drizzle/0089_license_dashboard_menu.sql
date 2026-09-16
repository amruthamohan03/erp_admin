-- The Licence Dashboard's sidebar entry.
--
-- Parent resolved BY NAME and selected FROM the menu table, the pattern 0073
-- established and 0082 had to be corrected to: on a fresh database this table is
-- empty at migrate time (menus are seeded afterwards), so the SELECT returns no
-- rows and the statement is a silent no-op rather than a foreign-key violation
-- that aborts the whole run. seedMenus carries the same row for that case.
--
-- Order 2 puts it directly under "Create Import License" (1) and above
-- "Licenses (list)" (3) — a dashboard is what you open first.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 2, 1, 'License Dashboard', '/licenses/dashboard', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'License Management' AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/licenses/dashboard'
  );
--> statement-breakpoint

-- §4.7 — the menu URL IS the permission resource, so a new screen with no
-- mapping row is denied to everyone including the Super Admin.
--
-- Granted to every role that can already see the LICENCE LIST, not just to
-- admin: the dashboard shows the same licences through the same predicates, so
-- anyone who may read the list may read its summary. A role that cannot see
-- licences gets nothing, which is the point.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       true,  -- can_view: the whole point
       false, false, false, false,  -- a dashboard creates and changes nothing
       false, false,
       r."can_export",              -- it offers no export of its own today, but
                                    -- inherit rather than invent a narrower right
       false,
       r."can_print",
       false, false, false
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" lst ON lst."id" = r."menu_id" AND lst."url" = '/licenses'
  JOIN "menu_master_t" d   ON d."url" = '/licenses/dashboard'
 WHERE r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
