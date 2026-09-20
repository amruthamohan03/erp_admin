-- In-app notifications and role-to-role messages.
--
-- One inbox for both (notification_t): system alerts raised when a record
-- changes status, and messages written by one role to other roles. Each is
-- addressed to roles and/or users (notification_recipient_t) and each user
-- marks it read for themselves (notification_read_t).
--
-- Which roles hear about which event, and what it says, is configuration:
-- notification_event_master_t + notification_event_role_t, edited under
-- Masters → Notification Events (§4.1). The code only raises the event key.
-- See src/db/queries/notifications.ts.

CREATE TABLE IF NOT EXISTS "notification_event_master_t" (
  "id"               serial PRIMARY KEY,
  "event_key"        varchar(100) NOT NULL UNIQUE,
  "module"           varchar(60) NOT NULL,
  "name"             varchar(150) NOT NULL,
  "title_template"   varchar(200) NOT NULL,
  "message_template" text NOT NULL,
  "link_template"    varchar(300),
  "notify_creator"   boolean NOT NULL DEFAULT true,
  "priority"         varchar(10) NOT NULL DEFAULT 'normal' CHECK ("priority" IN ('normal', 'high')),
  "display"          varchar(1) NOT NULL DEFAULT 'Y',
  "created_by"       integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by"       integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_event_role_t" (
  "id"       serial PRIMARY KEY,
  "event_id" integer NOT NULL REFERENCES "notification_event_master_t"("id") ON DELETE CASCADE,
  "role_id"  integer NOT NULL REFERENCES "role_master_t"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_notification_event_role" ON "notification_event_role_t" ("event_id", "role_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_t" (
  "id"             serial PRIMARY KEY,
  "kind"           varchar(10) NOT NULL CHECK ("kind" IN ('event', 'message')),
  "event_key"      varchar(100),
  "module"         varchar(60),
  "title"          varchar(200) NOT NULL,
  "body"           text NOT NULL,
  "link_url"       varchar(300),
  "priority"       varchar(10) NOT NULL DEFAULT 'normal' CHECK ("priority" IN ('normal', 'high')),
  "sender_user_id" integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "sender_role_id" integer REFERENCES "role_master_t"("id") ON DELETE SET NULL,
  "display"        varchar(1) NOT NULL DEFAULT 'Y',
  "created_at"     timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_t_kind" ON "notification_t" ("kind", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_t_sender" ON "notification_t" ("sender_user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_recipient_t" (
  "id"              serial PRIMARY KEY,
  "notification_id" integer NOT NULL REFERENCES "notification_t"("id") ON DELETE CASCADE,
  "role_id"         integer REFERENCES "role_master_t"("id") ON DELETE CASCADE,
  "user_id"         integer REFERENCES "users_t"("id") ON DELETE CASCADE,
  -- Addressed to a role OR to one user — exactly one.
  CONSTRAINT "notification_recipient_one_target" CHECK (("role_id" IS NULL) <> ("user_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_recipient_notification" ON "notification_recipient_t" ("notification_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_recipient_role" ON "notification_recipient_t" ("role_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_recipient_user" ON "notification_recipient_t" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_read_t" (
  "notification_id" integer NOT NULL REFERENCES "notification_t"("id") ON DELETE CASCADE,
  "user_id"         integer NOT NULL REFERENCES "users_t"("id") ON DELETE CASCADE,
  "read_at"         timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("notification_id", "user_id")
);
--> statement-breakpoint

-- The event catalogue. Tokens in {braces} are filled when the event is raised;
-- {actor} and {actor_role} are always available.
INSERT INTO "notification_event_master_t"
  ("event_key", "module", "name", "title_template", "message_template", "link_template", "notify_creator", "priority")
SELECT v.* FROM (VALUES
  ('payment.submitted', 'Payment Request', 'Payment request submitted',
   'Payment request {ref} submitted',
   '{actor} ({actor_role}) raised payment request {ref} — {amount} {currency} for {beneficiary}. It is waiting for approval.',
   '/payments', false, 'normal'),
  ('payment.resubmitted', 'Payment Request', 'Payment request resubmitted after rejection',
   'Payment request {ref} resubmitted',
   '{actor} corrected and resubmitted payment request {ref} — {amount} {currency}. It is waiting for approval again.',
   '/payments', false, 'normal'),
  ('payment.approved.dept', 'Payment Request', 'Payment request approved — Department',
   'Payment request {ref} approved at {stage}',
   '{actor} ({actor_role}) approved payment request {ref} — {amount} {currency} — at {stage}. It moves to the next approval.',
   '/payments', true, 'normal'),
  ('payment.approved.finance', 'Payment Request', 'Payment request approved — Finance',
   'Payment request {ref} approved at {stage}',
   '{actor} ({actor_role}) approved payment request {ref} — {amount} {currency} — at {stage}. It moves to the next approval.',
   '/payments', true, 'normal'),
  ('payment.approved.management', 'Payment Request', 'Payment request approved — Management',
   'Payment request {ref} approved at {stage}',
   '{actor} ({actor_role}) approved payment request {ref} — {amount} {currency} — at {stage}. It moves to the next approval.',
   '/payments', true, 'normal'),
  ('payment.approved.under_process', 'Payment Request', 'Payment request approved — Under Process',
   'Payment request {ref} approved at {stage}',
   '{actor} ({actor_role}) approved payment request {ref} — {amount} {currency} — at {stage}. It is ready to be paid.',
   '/payments', true, 'normal'),
  ('payment.approved.paid', 'Payment Request', 'Payment request paid',
   'Payment request {ref} paid',
   '{actor} ({actor_role}) marked payment request {ref} — {amount} {currency} — as {stage}.',
   '/payments', true, 'normal'),
  ('payment.rejected', 'Payment Request', 'Payment request rejected',
   'Payment request {ref} rejected at {stage}',
   '{actor} ({actor_role}) rejected payment request {ref} at {stage}: {reason}',
   '/payments', true, 'high'),
  ('import_invoice.validated', 'Import Invoice', 'Import invoice validated',
   'Import invoice {ref} validated',
   '{actor} ({actor_role}) validated import invoice {ref}.',
   '/import-invoices', true, 'normal'),
  ('import_invoice.dgi_verified', 'Import Invoice', 'Import invoice DGI verified',
   'Import invoice {ref} DGI verified',
   '{actor} ({actor_role}) completed the DGI details of import invoice {ref}; it is now DGI verified.',
   '/import-invoices', true, 'normal'),
  ('export_invoice.validated', 'Export Invoice', 'Export invoice validated',
   'Export invoice {ref} validated',
   '{actor} ({actor_role}) validated export invoice {ref}.',
   '/export-invoices', true, 'normal'),
  ('export_invoice.dgi_verified', 'Export Invoice', 'Export invoice DGI verified',
   'Export invoice {ref} DGI verified',
   '{actor} ({actor_role}) completed the DGI details of export invoice {ref}; it is now DGI verified.',
   '/export-invoices', true, 'normal'),
  ('fiche.created', 'Fiche de Calcul', 'Fiche created',
   'Fiche {ref} created',
   '{actor} ({actor_role}) raised fiche {ref} on {mca_ref} ({client}). It is waiting for verification.',
   '/fiches', false, 'normal'),
  ('fiche.verify', 'Fiche de Calcul', 'Fiche verified',
   'Fiche {ref} verified',
   '{actor} ({actor_role}) verified fiche {ref} ({mca_ref}). It is waiting for audit.',
   '/fiches', true, 'normal'),
  ('fiche.audit', 'Fiche de Calcul', 'Fiche audited',
   'Fiche {ref} audited',
   '{actor} ({actor_role}) audited fiche {ref} ({mca_ref}). It is now final.',
   '/fiches', true, 'normal'),
  ('file.cancelled', 'Tracking', 'Tracking file cancelled',
   '{kind} file {ref} cancelled',
   '{actor} ({actor_role}) cancelled {kind} file {ref} on {date}: {reason}. It is closed to invoices and payment requests.',
   '/tracking/file-cancellation', true, 'high')
) AS v(event_key, module, name, title_template, message_template, link_template, notify_creator, priority)
WHERE NOT EXISTS (SELECT 1 FROM "notification_event_master_t" e WHERE e."event_key" = v.event_key);
--> statement-breakpoint

-- Default recipients. A payment event goes to the roles that act on the NEXT
-- stage, as already granted under Role Payment Stage Mapping; everything else
-- starts with the Super Admin and is widened under Masters → Notification Events.
INSERT INTO "notification_event_role_t" ("event_id", "role_id")
SELECT DISTINCT e."id", g."role_id"
FROM (VALUES
  ('payment.submitted', 'dept'),
  ('payment.resubmitted', 'dept'),
  ('payment.approved.dept', 'finance'),
  ('payment.approved.finance', 'management'),
  ('payment.approved.management', 'under_process'),
  ('payment.approved.under_process', 'paid')
) AS m(event_key, next_stage)
JOIN "notification_event_master_t" e ON e."event_key" = m.event_key
JOIN "payment_stage_role_master_t" g ON g."stage" = m.next_stage AND g."display" = 'Y'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "notification_event_role_t" ("event_id", "role_id")
SELECT e."id", 1
FROM "notification_event_master_t" e
WHERE e."event_key" NOT LIKE 'payment.%'
  AND EXISTS (SELECT 1 FROM "role_master_t" r WHERE r."id" = 1)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Menus: a Communication group (Notifications, Messages) and the event master.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT NULL, 1, 0, 'Communication', '#', 'ti ti-bell', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM "menu_master_t" WHERE "menu_name" = 'Communication' AND "menu_level" = 0);
--> statement-breakpoint
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", v.ord, 1, v.name, v.url, '', 'Y'
FROM "menu_master_t" p
CROSS JOIN (VALUES ('Notifications', '/notifications', 1), ('Messages', '/messages', 2)) AS v(name, url, ord)
WHERE p."menu_name" = 'Communication' AND p."menu_level" = 0
  AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = v.url);
--> statement-breakpoint
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT p."id", 206, 1, 'Notification Events', '/masters/notification-events', '', 'Y'
FROM "menu_master_t" p
WHERE p."menu_name" = 'Masters' AND p."menu_level" = 0
  AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/notification-events');
--> statement-breakpoint

-- Every role has an inbox and may message other roles; narrow it per role under
-- Role Menu Mapping. The event master is the Super Admin's.
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve")
SELECT r."id", m."id", true, m."url" = '/messages', false, false, false
FROM "role_master_t" r
CROSS JOIN "menu_master_t" m
WHERE r."display" = 'Y' AND m."url" IN ('/notifications', '/messages')
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = r."id" AND x."menu_id" = m."id"
  );
--> statement-breakpoint
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve")
SELECT 1, m."id", true, true, true, true, true
FROM "menu_master_t" m
WHERE m."url" = '/masters/notification-events'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = 1 AND x."menu_id" = m."id"
  );
