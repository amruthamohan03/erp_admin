-- The Import and Export Tracking dashboards' sidebar entries.
--
-- Parent resolved BY NAME and selected FROM the menu table, the pattern 0073
-- established and 0089 followed: on a fresh database this table is empty at
-- migrate time (menus are seeded afterwards), so the SELECT returns no rows and
-- the statement is a silent no-op rather than a foreign-key violation that
-- aborts the whole run. seedMenus carries the same rows for that case.
--
-- Orders 43/44 put the pair after "Fiche de Calcul" (42) and before the KPI
-- screens they link to. They are NOT slotted beside their own lists (39/40)
-- because that would mean renumbering live menu rows, and "Export Tracking" and
-- "PARTIELLE Allocation" already share order 40 — a renumber is a bigger and
-- riskier change than this feature needs.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 43, 1, 'Import Tracking Dashboard', '/imports/dashboard', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Tracking Management' AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/imports/dashboard'
  );
--> statement-breakpoint

INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 44, 1, 'Export Tracking Dashboard', '/exports/dashboard', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Tracking Management' AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/exports/dashboard'
  );
--> statement-breakpoint

-- §4.7 — the menu URL IS the permission resource, so a new screen with no
-- mapping row is denied to everyone including the Super Admin.
--
-- Granted to every role that can already see the IMPORT LIST: the dashboard
-- shows the same files through the same predicates, so anyone who may read the
-- list may read its summary. A role that cannot see imports gets nothing.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       true,                        -- can_view: the whole point
       false, false, false, false,  -- a dashboard creates and changes nothing
       false, false,
       r."can_export",              -- inherit rather than invent a narrower right
       false,
       r."can_print",
       false, false, false
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" lst ON lst."id" = r."menu_id" AND lst."url" = '/imports'
  JOIN "menu_master_t" d   ON d."url" = '/imports/dashboard'
 WHERE r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
--> statement-breakpoint

-- The same, from the EXPORT list's viewers. Kept as a separate statement rather
-- than one query over both: a role may see imports and not exports, and joining
-- the two would hand it whichever dashboard it did not earn.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       true,
       false, false, false, false,
       false, false,
       r."can_export",
       false,
       r."can_print",
       false, false, false
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" lst ON lst."id" = r."menu_id" AND lst."url" = '/exports'
  JOIN "menu_master_t" d   ON d."url" = '/exports/dashboard'
 WHERE r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
