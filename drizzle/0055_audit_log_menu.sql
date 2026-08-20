-- 0055 — the Audit Log screen needs a menu row: the sidebar shows it, and
-- role_menu_mapping_t hangs its permissions off it (§4.7 — the menu URL *is*
-- the permission resource).
--
-- §4.28 requires viewing and exporting the log to be two separate grants, so the
-- Super Admin seed sets can_view_audit and can_export_audit independently rather
-- than folding them into can_view / can_export.
INSERT INTO "menu_master_t" ("menu_name", "menu_order", "url", "icon", "menu_level", "display")
SELECT 'Audit Log', 97, '/audit-log', 'ti ti-history', 0, 'Y'
 WHERE NOT EXISTS (SELECT 1 FROM "menu_master_t" WHERE "url" = '/audit-log');

INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_view_audit", "can_export_audit", "can_export")
SELECT 1, m."id", true, true, true, true
  FROM "menu_master_t" m
 WHERE m."url" = '/audit-log'
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x
      WHERE x."role_id" = 1 AND x."menu_id" = m."id");
