-- Live Chat: a sender can delete their own message (§4.27 — soft delete). The
-- row is kept with display = 'N'; both sides stop seeing it, and the contact
-- previews and unread badges skip it.
ALTER TABLE "chat_message_t" ADD COLUMN IF NOT EXISTS "display" varchar(1) DEFAULT 'Y' NOT NULL;
--> statement-breakpoint
-- Deleting is gated on can_delete for /chat, which 0158 left off. Anyone who
-- may send may delete what they sent, so grant it to every role that already
-- has can_add; an administrator can withdraw it per role under Role to Menu.
UPDATE "role_menu_mapping_t" rm
   SET "can_delete" = true
  FROM "menu_master_t" m
 WHERE m."id" = rm."menu_id"
   AND m."url" = '/chat'
   AND rm."can_add" = true
   AND rm."can_delete" = false;
