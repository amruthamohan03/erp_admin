-- AI Search: the "Ask" screen and the header search box.
--
-- The `/ask` menu row is the resource (§4.7): can_view lets a role use AI
-- Search at all. What it can then FIND is decided per module by that role's own
-- menu grants (/licenses, /imports, /payments …), so granting /ask never widens
-- what a role can see. Only the Super Admin role is granted here.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT NULL, 1, 0, 'AI Search', '/ask', 'ti ti-sparkles', 'Y'
 WHERE NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/ask');
--> statement-breakpoint
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve")
SELECT 1, m."id", true, false, false, false, false
  FROM "menu_master_t" m
 WHERE m."url" = '/ask'
   AND EXISTS (SELECT 1 FROM "role_master_t" r WHERE r."id" = 1)
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = 1 AND x."menu_id" = m."id"
   );
