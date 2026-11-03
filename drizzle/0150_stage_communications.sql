-- Stage communications: email / WhatsApp to the client at each step from
-- licence to invoice, sent automatically or from a row's action buttons.
--
-- 1. communication_template_master_t — what is said at each stage, to whom,
--    and whether it goes out on its own. Edited under Masters → Communication
--    Templates; the code only says "a licence was created" (§4.1).
-- 2. outbound_message_t gains the record a message is about, the template it
--    came from, and a `queued` status: an automatic message is written inside
--    the transaction that made the change and sent after it commits.
-- 3. action_style_master_t gains `email` and `whatsapp`, the row actions (§4.26).
-- See src/db/queries/communicationTemplates.ts.

CREATE TABLE IF NOT EXISTS "communication_template_master_t" (
  "id"             serial PRIMARY KEY,
  "template_key"   varchar(100) NOT NULL,
  "name"           varchar(150) NOT NULL,
  "page_slug"      varchar(60)  NOT NULL,
  "trigger"        varchar(20)  NOT NULL,
  "trigger_key"    varchar(100),
  "trigger_value"  varchar(200),
  "auto_email"     boolean DEFAULT false NOT NULL,
  "auto_whatsapp"  boolean DEFAULT false NOT NULL,
  "recipient"      varchar(20) DEFAULT 'client' NOT NULL,
  "extra_to"       text DEFAULT '' NOT NULL,
  "cc"             text DEFAULT '' NOT NULL,
  "email_subject"  varchar(200) NOT NULL,
  "email_body"     text NOT NULL,
  "whatsapp_body"  text NOT NULL,
  "display"        varchar(1) DEFAULT 'Y' NOT NULL,
  "created_by"     integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "updated_by"     integer REFERENCES "users_t"("id") ON DELETE SET NULL,
  "created_at"     timestamp DEFAULT now() NOT NULL,
  "updated_at"     timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "communication_template_master_t_template_key_unique" UNIQUE ("template_key"),
  CONSTRAINT "communication_template_master_t_trigger_check"
    CHECK ("trigger" IN ('create', 'field_change', 'event', 'manual')),
  CONSTRAINT "communication_template_master_t_recipient_check"
    CHECK ("recipient" IN ('client', 'client_payment', 'client_all'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_communication_template_master_t_page"
  ON "communication_template_master_t" ("page_slug", "trigger");
--> statement-breakpoint

ALTER TABLE "outbound_message_t" ADD COLUMN IF NOT EXISTS "entity_type" varchar(60);
--> statement-breakpoint
ALTER TABLE "outbound_message_t" ADD COLUMN IF NOT EXISTS "entity_id" integer;
--> statement-breakpoint
ALTER TABLE "outbound_message_t" ADD COLUMN IF NOT EXISTS "template_key" varchar(100);
--> statement-breakpoint
ALTER TABLE "outbound_message_t" ADD COLUMN IF NOT EXISTS "origin" varchar(10) DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "outbound_message_t" DROP CONSTRAINT IF EXISTS "outbound_message_t_status_check";
--> statement-breakpoint
ALTER TABLE "outbound_message_t" ADD CONSTRAINT "outbound_message_t_status_check"
  CHECK ("status" IN ('queued', 'sending', 'sent', 'partial', 'failed'));
--> statement-breakpoint
ALTER TABLE "outbound_message_t" DROP CONSTRAINT IF EXISTS "outbound_message_t_origin_check";
--> statement-breakpoint
ALTER TABLE "outbound_message_t" ADD CONSTRAINT "outbound_message_t_origin_check"
  CHECK ("origin" IN ('manual', 'auto'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbound_message_t_entity" ON "outbound_message_t" ("entity_type", "entity_id");
--> statement-breakpoint
-- The drain picks up queued rows oldest first; partial so it stays tiny.
CREATE INDEX IF NOT EXISTS "idx_outbound_message_t_queued" ON "outbound_message_t" ("id") WHERE "status" = 'queued';
--> statement-breakpoint

INSERT INTO "action_style_master_t" ("action_key", "label", "color", "icon", "display_order", "display")
VALUES ('email', 'Send Email', '#0284c7', 'Mail', 17, 'Y'),
       ('whatsapp', 'Send WhatsApp', '#16a34a', 'MessageCircle', 18, 'Y')
ON CONFLICT ("action_key") DO NOTHING;
--> statement-breakpoint

-- Shipped templates, one manual template per stage plus the automatic ones.
-- Automatic EMAIL is on; automatic WhatsApp is off, because the Cloud API only
-- delivers free-form text to a number that wrote to the business in the last
-- 24 hours — an operator switches it on knowing that.
INSERT INTO "communication_template_master_t"
  ("template_key", "name", "page_slug", "trigger", "trigger_key", "trigger_value", "auto_email", "auto_whatsapp",
   "recipient", "email_subject", "email_body", "whatsapp_body")
VALUES
  ('license.created', 'Import licence registered', 'license', 'create', NULL, NULL, true, false, 'client',
   'Licence {license_number} registered',
   '<p>Dear {client_name},</p><p>Your import licence <strong>{license_number}</strong> has been registered with us.</p><p>We will keep you informed as the file progresses.</p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, your import licence {license_number} has been registered with us. — {company}'),
  ('license.manual', 'Import licence — message', 'license', 'manual', NULL, NULL, false, false, 'client',
   'Licence {license_number}',
   '<p>Dear {client_name},</p><p>Regarding your licence <strong>{license_number}</strong>:</p><p></p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, regarding your licence {license_number}: '),
  ('export-license.created', 'Export licence registered', 'export-license', 'create', NULL, NULL, true, false, 'client',
   'Export licence {license_number} registered',
   '<p>Dear {client_name},</p><p>Your export licence <strong>{license_number}</strong> has been registered with us.</p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, your export licence {license_number} has been registered with us. — {company}'),
  ('export-license.manual', 'Export licence — message', 'export-license', 'manual', NULL, NULL, false, false, 'client',
   'Export licence {license_number}',
   '<p>Dear {client_name},</p><p>Regarding your export licence <strong>{license_number}</strong>:</p><p></p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, regarding your export licence {license_number}: '),
  ('quotation.created', 'Quotation issued', 'quotation', 'create', NULL, NULL, true, false, 'client',
   'Quotation {quotation_ref}',
   '<p>Dear {client_name},</p><p>Our quotation <strong>{quotation_ref}</strong> dated {quotation_date} has been prepared for you.</p><p>Please contact us with any questions.</p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, our quotation {quotation_ref} dated {quotation_date} has been prepared for you. — {company}'),
  ('quotation.manual', 'Quotation — message', 'quotation', 'manual', NULL, NULL, false, false, 'client',
   'Quotation {quotation_ref}',
   '<p>Dear {client_name},</p><p>Regarding quotation <strong>{quotation_ref}</strong>:</p><p></p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, regarding quotation {quotation_ref}: '),
  ('fiche.manual', 'Fiche de calcul — message', 'fiche', 'manual', NULL, NULL, false, false, 'client',
   'Fiche de calcul {fiche_reference}',
   '<p>Dear {client_name},</p><p>Regarding fiche de calcul <strong>{fiche_reference}</strong>:</p><p></p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, regarding fiche de calcul {fiche_reference}: '),
  ('import.created', 'Import file opened', 'import', 'create', NULL, NULL, true, false, 'client',
   'Import file {mca_ref} opened',
   '<p>Dear {client_name},</p><p>Your import file <strong>{mca_ref}</strong> has been opened and clearance has started.</p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, your import file {mca_ref} has been opened and clearance has started. — {company}'),
  ('import.clearing_status', 'Import clearing status changed', 'import', 'field_change', 'clearing_status', NULL, true, false, 'client',
   'Import file {mca_ref} — {clearing_status}',
   '<p>Dear {client_name},</p><p>The clearing status of your import file <strong>{mca_ref}</strong> is now <strong>{clearing_status}</strong>.</p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, import file {mca_ref} is now {clearing_status}. — {company}'),
  ('import.manual', 'Import file — message', 'import', 'manual', NULL, NULL, false, false, 'client',
   'Import file {mca_ref}',
   '<p>Dear {client_name},</p><p>Regarding your import file <strong>{mca_ref}</strong> (status: {clearing_status}):</p><p></p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, regarding import file {mca_ref} ({clearing_status}): '),
  ('export.created', 'Export file opened', 'export', 'create', NULL, NULL, true, false, 'client',
   'Export file {mca_ref} opened',
   '<p>Dear {client_name},</p><p>Your export file <strong>{mca_ref}</strong> has been opened and clearance has started.</p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, your export file {mca_ref} has been opened and clearance has started. — {company}'),
  ('export.clearing_status', 'Export declaration status changed', 'export', 'field_change', 'clearing_status', NULL, true, false, 'client',
   'Export file {mca_ref} — {clearing_status}',
   '<p>Dear {client_name},</p><p>The declaration status of your export file <strong>{mca_ref}</strong> is now <strong>{clearing_status}</strong>.</p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, export file {mca_ref} is now {clearing_status}. — {company}'),
  ('export.manual', 'Export file — message', 'export', 'manual', NULL, NULL, false, false, 'client',
   'Export file {mca_ref}',
   '<p>Dear {client_name},</p><p>Regarding your export file <strong>{mca_ref}</strong> (status: {clearing_status}):</p><p></p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, regarding export file {mca_ref} ({clearing_status}): '),
  ('local.created', 'Local file opened', 'local', 'create', NULL, NULL, true, false, 'client',
   'Local file {mca_lt_reference} opened',
   '<p>Dear {client_name},</p><p>Your local file <strong>{mca_lt_reference}</strong> has been opened.</p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, your local file {mca_lt_reference} has been opened. — {company}'),
  ('local.clearing_status', 'Local clearing status changed', 'local', 'field_change', 'clearing_status', NULL, true, false, 'client',
   'Local file {mca_lt_reference} — {clearing_status}',
   '<p>Dear {client_name},</p><p>The clearing status of your local file <strong>{mca_lt_reference}</strong> is now <strong>{clearing_status}</strong>.</p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, local file {mca_lt_reference} is now {clearing_status}. — {company}'),
  ('local.manual', 'Local file — message', 'local', 'manual', NULL, NULL, false, false, 'client',
   'Local file {mca_lt_reference}',
   '<p>Dear {client_name},</p><p>Regarding your local file <strong>{mca_lt_reference}</strong>:</p><p></p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, regarding local file {mca_lt_reference}: '),
  ('export-invoices.validated', 'Export invoice validated', 'export-invoices', 'event', 'export_invoice.validated', NULL, true, false, 'client_all',
   'Invoice {invoice_ref}',
   '<p>Dear {client_name},</p><p>Invoice <strong>{invoice_ref}</strong> dated {invoice_date} has been issued for your export file.</p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, invoice {invoice_ref} dated {invoice_date} has been issued. — {company}'),
  ('export-invoices.manual', 'Export invoice — message', 'export-invoices', 'manual', NULL, NULL, false, false, 'client_all',
   'Invoice {invoice_ref}',
   '<p>Dear {client_name},</p><p>Regarding invoice <strong>{invoice_ref}</strong> dated {invoice_date}:</p><p></p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, regarding invoice {invoice_ref}: '),
  ('import-invoices.validated', 'Import invoice validated', 'import-invoices', 'event', 'import_invoice.validated', NULL, true, false, 'client_all',
   'Invoice {invoice_ref}',
   '<p>Dear {client_name},</p><p>Invoice <strong>{invoice_ref}</strong> dated {invoice_date} has been issued for your import file.</p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, invoice {invoice_ref} dated {invoice_date} has been issued. — {company}'),
  ('import-invoices.manual', 'Import invoice — message', 'import-invoices', 'manual', NULL, NULL, false, false, 'client_all',
   'Invoice {invoice_ref}',
   '<p>Dear {client_name},</p><p>Regarding invoice <strong>{invoice_ref}</strong> dated {invoice_date}:</p><p></p><p>Kind regards,<br>{company}</p>',
   'Dear {client_code}, regarding invoice {invoice_ref}: ')
ON CONFLICT ("template_key") DO NOTHING;
--> statement-breakpoint

-- The master screen's menu row is its permission resource (§4.7), filed beside
-- Notification Events. Administrator only by default.
INSERT INTO "menu_master_t" ("menu_id", "menu_order", "menu_level", "menu_name", "url", "icon", "display")
SELECT n."menu_id", n."menu_order" + 1, n."menu_level", 'Communication Templates', '/masters/communication-templates', '', 'Y'
  FROM "menu_master_t" n
 WHERE n."url" = '/masters/notification-events'
   AND NOT EXISTS (SELECT 1 FROM "menu_master_t" m WHERE m."url" = '/masters/communication-templates');
--> statement-breakpoint
INSERT INTO "role_menu_mapping_t" ("role_id", "menu_id", "can_view", "can_add", "can_edit", "can_delete", "can_approve")
SELECT 1, m."id", true, true, true, true, false
  FROM "menu_master_t" m
 WHERE m."url" = '/masters/communication-templates'
   AND EXISTS (SELECT 1 FROM "role_master_t" r WHERE r."id" = 1)
   AND NOT EXISTS (
     SELECT 1 FROM "role_menu_mapping_t" x WHERE x."role_id" = 1 AND x."menu_id" = m."id"
   );
