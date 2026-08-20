-- 0053 — the Recycle Bin screen needs a menu row so the sidebar can show it and
-- role_menu_mapping_t has something to hang its permissions off (§4.7: the menu
-- URL *is* the permission resource).
--
-- Idempotent on url, and the Super Admin grant mirrors 0052 so the screen is
-- reachable immediately rather than after a manual permission edit.
INSERT INTO "menu_master_t" ("menu_name", "menu_order", "url", "icon", "menu_level", "display")
SELECT 'Recycle Bin', 96, '/recycle-bin', 'ti ti-trash', 0, 'Y'
 WHERE NOT EXISTS (SELECT 1 FROM "menu_master_t" WHERE "url" = '/recycle-bin');

INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_restore", "can_permanent_delete")
SELECT 1, m."id", true, true, true
  FROM "menu_master_t" m
 WHERE m."url" = '/recycle-bin'
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = 1 AND x."menu_id" = m."id");
