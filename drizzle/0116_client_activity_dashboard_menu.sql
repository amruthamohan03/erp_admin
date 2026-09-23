-- The Client Activity Dashboard's sidebar entry.
--
-- One client's own picture — open files, licence headroom, outstanding payments
-- and recent movement — as against /clients/dashboard, which reports on the
-- client BASE. Nothing here creates a table: every figure is an aggregate over
-- rows that already exist (§4.29).
--
-- Parent resolved BY NAME from the table, the pattern 0089 established: on a
-- fresh database menus are seeded after migrations run, so the SELECT finds
-- nothing and this is a silent no-op rather than a foreign-key violation.
-- seedMenus carries the same row for that case.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 48, 1, 'Client Activity Dashboard', '/clients/activity', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Client Management' AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/clients/activity'
  );
--> statement-breakpoint

-- §4.7 — the menu URL IS the permission resource, so a new screen with no
-- mapping row is denied to everyone including the Super Admin.
--
-- Granted to every role that can already see the CLIENT DASHBOARD: this screen
-- shows the same clients' own activity, so anyone who may read that may read
-- this. Read-only — it creates and changes nothing.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT r."role_id", d."id",
       true,
       false, false, false, false,
       false, false,
       r."can_export", false, r."can_print",
       false, false, false
  FROM "role_menu_mapping_t" r
  JOIN "menu_master_t" src ON src."id" = r."menu_id" AND src."url" = '/clients/dashboard'
  JOIN "menu_master_t" d ON d."url" = '/clients/activity'
 WHERE r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
--> statement-breakpoint

-- The placeholder this replaces. It pointed at '#' under Tracking Management
-- and was reserved for exactly this screen; leaving it would give the operator
-- two entries for one idea, one of which does nothing. Its permission rows go
-- with it — the menu row is the permission's owner (§4.7).
DELETE FROM "role_menu_mapping_t"
 WHERE "menu_id" IN (
   SELECT "id" FROM "menu_master_t"
    WHERE "menu_name" = 'Client Import Dashboard' AND "url" = '#'
 );
--> statement-breakpoint

DELETE FROM "menu_master_t"
 WHERE "menu_name" = 'Client Import Dashboard' AND "url" = '#';
