-- Import License → Bivac: the PARTIELLE management screen at /bivac.
--
-- The menu has carried a "Bivac" entry under Import License since the port,
-- pointing at '#' because the module was not on the branch yet. The screen now
-- exists, so that entry is pointed at it rather than a second one added beside
-- it. Matched by name and parent, so it lands the same whatever the ids are.
UPDATE "menu_master_t" m
   SET "url" = '/bivac',
       "display" = 'Y'
  FROM "menu_master_t" p
 WHERE m."menu_id" = p."id"
   AND p."menu_name" = 'Import License' AND p."menu_level" = 0
   -- '#', or a path typed without its leading slash — which grants nothing,
   -- since permissions are looked up by exact URL.
   AND m."menu_name" = 'Bivac' AND (m."url" = '#' OR m."url" NOT LIKE '/%')
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" x WHERE x."url" = '/bivac');
--> statement-breakpoint
-- An install that never had the placeholder gets the entry appended.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id",
       COALESCE((SELECT max(c."menu_order") FROM "menu_master_t" c WHERE c."menu_id" = p."id"), 0) + 1,
       1, 'Bivac', '/bivac', '', 'Y'
  FROM "menu_master_t" p
 WHERE p."menu_name" = 'Import License' AND p."menu_level" = 0
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/bivac');
--> statement-breakpoint
-- An install seeded with a separate "PARTIELLE (Bivac)" row already had /bivac,
-- so the update above skipped it and the '#' placeholder is still there. Hide
-- it: a dead link beside the live one only sends operators nowhere.
UPDATE "menu_master_t" m
   SET "display" = 'N'
  FROM "menu_master_t" p
 WHERE m."menu_id" = p."id"
   AND p."menu_name" = 'Import License' AND p."menu_level" = 0
   AND m."menu_name" = 'Bivac' AND m."url" = '#';
--> statement-breakpoint
-- Super Admin only; every other role is granted under Mapping → Role to Menu.
INSERT INTO "role_menu_mapping_t"
  ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve",
   "can_restore", "can_permanent_delete", "can_export", "can_import", "can_print",
   "can_view_audit", "can_export_audit", "can_manage_settings")
SELECT 1, m."id", true, true, true, true, true, true, true, true, true, true, true, true, true
  FROM "menu_master_t" m
 WHERE m."url" = '/bivac'
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = 1 AND x."menu_id" = m."id");
