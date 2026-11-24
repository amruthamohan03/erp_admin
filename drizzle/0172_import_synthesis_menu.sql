-- Import License → Import Synthesis: the licence synthesis screen at
-- /import-synthesis, ported from the legacy IsController. No tables — it reads
-- licences, import files and Import Apurement's records.
--
-- The menu has carried an "Import Synthesis" entry under Import License at '#'
-- since the port; point it at the screen rather than add a second one. Matched
-- whatever its URL was since edited to — '#' or a path typed without its
-- leading slash, which grants nothing because permissions match the URL exactly.
UPDATE "menu_master_t" m
   SET "url" = '/import-synthesis',
       "display" = 'Y'
  FROM "menu_master_t" p
 WHERE m."menu_id" = p."id"
   AND p."menu_name" = 'Import License' AND p."menu_level" = 0
   AND upper(m."menu_name") = 'IMPORT SYNTHESIS'
   AND (m."url" = '#' OR m."url" NOT LIKE '/%')
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" x WHERE x."url" = '/import-synthesis');
--> statement-breakpoint
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id",
       COALESCE((SELECT max(c."menu_order") FROM "menu_master_t" c WHERE c."menu_id" = p."id"), 0) + 1,
       1, 'Import Synthesis', '/import-synthesis', '', 'Y'
  FROM "menu_master_t" p
 WHERE p."menu_name" = 'Import License' AND p."menu_level" = 0
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/import-synthesis');
--> statement-breakpoint
-- Super Admin only; every other role is granted under Mapping → Role to Menu.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT 1, m."id", true, true, true, true, true, true, true, true, true, true, true, true, true
  FROM "menu_master_t" m
 WHERE m."url" = '/import-synthesis'
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = 1 AND x."menu_id" = m."id");
