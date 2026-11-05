-- Communication → Live Chat: one-to-one messages between signed-in users.
--
-- Who may chat is configuration, not code (§4.1, §4.7): the `/chat` menu row
-- below is the resource, `can_view` lets a role read and appear as a contact,
-- `can_add` lets it send. Only the Super Admin role is granted here; every other
-- role is switched on under Mapping → Role to Menu.
CREATE TABLE IF NOT EXISTS "chat_message_t" (
  "id" serial PRIMARY KEY NOT NULL,
  "sender_user_id" integer NOT NULL REFERENCES "users_t"("id"),
  "recipient_user_id" integer NOT NULL REFERENCES "users_t"("id"),
  "body" text NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chat_message_t_not_self" CHECK ("sender_user_id" <> "recipient_user_id"),
  CONSTRAINT "chat_message_t_body_length" CHECK (char_length("body") between 1 and 2000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_message_t_recipient_unread" ON "chat_message_t" ("recipient_user_id", "read_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_message_t_pair" ON "chat_message_t" ("sender_user_id", "recipient_user_id", "id");
--> statement-breakpoint
-- Under Communication, after its last entry.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id",
       COALESCE((SELECT max(c."menu_order") FROM "menu_master_t" c WHERE c."menu_id" = p."id"), 0) + 1,
       1, 'Live Chat', '/chat', '', 'Y'
  FROM "menu_master_t" p
 WHERE p."id" = (SELECT m."menu_id" FROM "menu_master_t" m WHERE m."url" = '/messages' LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/chat');
--> statement-breakpoint
-- A Communication parent may be missing on an unusual install; the screen must
-- still be grantable, so fall back to a top-level entry.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT NULL, 99, 0, 'Live Chat', '/chat', 'ti ti-message-circle', 'Y'
 WHERE NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/chat');
--> statement-breakpoint
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve")
SELECT 1, m."id", true, true, false, false, false
  FROM "menu_master_t" m
 WHERE m."url" = '/chat'
   AND EXISTS (SELECT 1 FROM "role_master_t" r WHERE r."id" = 1)
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = 1 AND x."menu_id" = m."id"
   );
