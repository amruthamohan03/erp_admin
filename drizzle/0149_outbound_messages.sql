-- Communication → Email & WhatsApp: messages sent to people outside the system.
--
-- One row per message (outbound_message_t); attachments are files_t rows with
-- entity_type 'outbound_message'. The row is written before the provider is
-- called and finished after, so an interrupted send is still on record.
-- See src/db/queries/outboundMessages.ts.
CREATE TABLE IF NOT EXISTS "outbound_message_t" (
  "id"               serial PRIMARY KEY,
  "channel"          varchar(20) NOT NULL,
  "to_recipients"    jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cc_recipients"    jsonb DEFAULT '[]'::jsonb NOT NULL,
  "bcc_recipients"   jsonb DEFAULT '[]'::jsonb NOT NULL,
  "subject"          varchar(200) DEFAULT '' NOT NULL,
  "body_html"        text NOT NULL,
  "body_text"        text NOT NULL,
  "status"           varchar(20) DEFAULT 'sending' NOT NULL,
  "error"            text,
  "results"          jsonb DEFAULT '[]'::jsonb NOT NULL,
  "attachment_count" integer DEFAULT 0 NOT NULL,
  "sent_by"          integer REFERENCES "users_t"("id"),
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at"          timestamp with time zone,
  "display"          varchar(1) DEFAULT 'Y' NOT NULL,
  CONSTRAINT "outbound_message_t_channel_check" CHECK ("channel" IN ('email', 'whatsapp')),
  CONSTRAINT "outbound_message_t_status_check" CHECK ("status" IN ('sending', 'sent', 'partial', 'failed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbound_message_t_created" ON "outbound_message_t" ("created_at");
--> statement-breakpoint

-- The menu row is the permission resource (§4.7), filed under Communication
-- beside Notifications and Messages.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 3, 1, 'Email & WhatsApp', '/communications', '', 'Y'
  FROM "menu_master_t" p
 WHERE p."menu_name" = 'Communication' AND p."menu_level" = 0
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/communications');
--> statement-breakpoint

-- Sending to clients speaks for the company, so only the administrator role is
-- granted by default; any other role is given it under Role → Menu mapping.
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve")
SELECT 1, m."id", true, true, false, false, false
  FROM "menu_master_t" m
 WHERE m."url" = '/communications'
   AND EXISTS (SELECT 1 FROM "role_master_t" r WHERE r."id" = 1)
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = 1 AND x."menu_id" = m."id"
   );
