-- Repair: 0129 inserted nothing.
--
-- It resolved its parent by the name the SEED file uses for the payment group,
-- 'Advance Payment'. The live menu tree calls that group 'Payment', so the
-- SELECT matched no row and the INSERT was a silent no-op — the screen existed
-- with no way to reach it and, because the menu row IS the permission resource
-- (§4.7), no way to be granted either.
--
-- 0129 is applied, so it is not edited (§7.2 — a bad migration is fixed by a
-- new one). This matches EITHER name: the two spellings already disagree
-- between seed and database, and a menu insert must not depend on which of
-- them a given environment happens to carry.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 3, 1, 'Expense Tracker', '/expense-tracker', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" IN ('Payment', 'Advance Payment')
  AND p."menu_level" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/expense-tracker'
  )
LIMIT 1;
--> statement-breakpoint

-- §4.7 — granted to every role that can already view payment requests: this
-- reports on the money those requests moved. Read-only; export follows the
-- role's own export right, because a sheet of every file's margin leaves the
-- building.
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
  JOIN "menu_master_t" src ON src."id" = r."menu_id" AND src."url" = '/payments'
  JOIN "menu_master_t" d ON d."url" = '/expense-tracker'
 WHERE r."can_view" = true
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = r."role_id" AND x."menu_id" = d."id"
   );
