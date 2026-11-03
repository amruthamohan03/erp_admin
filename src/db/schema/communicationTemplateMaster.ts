import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersT } from './users';

// What the company tells a client at each stage from licence to invoice — the
// subject and body for email and for WhatsApp, who receives it, and whether it
// goes out on its own. Edited under Masters → Communication Templates (§4.1).
//
// A template belongs to one transaction page (`page_slug`) and fires on one
// trigger:
//   create        — the record was saved for the first time
//   field_change  — the column named in `trigger_key` changed; when
//                   `trigger_value` is set, only when its new LABEL is one of
//                   those comma-separated values (e.g. "CLEARING COMPLETED")
//   event         — the system event named in `trigger_key` was raised
//                   (`import_invoice.validated`, …)
//   manual        — never automatic; the draft behind the row's mail/WhatsApp
//                   buttons
// The trigger set is the engine's vocabulary, not business configuration, so
// it is a CHECK like outbound_message_t.status.
//
// Bodies carry `{token}` placeholders: any field of the page by its column
// name (rendered as the form shows it — a status by its label, a date as
// DD-MM-YYYY), plus {client_code}, {client_name}, {company}, {today}, {actor}.

// The trigger and recipient vocabularies are declared in
// src/schemas/communicationTemplates.ts, where the browser can read them too.

export const communicationTemplateMaster = pgTable(
  'communication_template_master_t',
  {
    id: serial('id').primaryKey(),
    templateKey: varchar('template_key', { length: 100 }).notNull().unique(),
    name: varchar('name', { length: 150 }).notNull(),
    pageSlug: varchar('page_slug', { length: 60 }).notNull(),
    trigger: varchar('trigger', { length: 20 }).notNull(),
    triggerKey: varchar('trigger_key', { length: 100 }),
    triggerValue: varchar('trigger_value', { length: 200 }),
    autoEmail: boolean('auto_email').notNull().default(false),
    autoWhatsapp: boolean('auto_whatsapp').notNull().default(false),
    recipient: varchar('recipient', { length: 20 }).notNull().default('client'),
    /** Comma-separated addresses always added to To, e.g. an operations mailbox. */
    extraTo: text('extra_to').notNull().default(''),
    cc: text('cc').notNull().default(''),
    emailSubject: varchar('email_subject', { length: 200 }).notNull(),
    emailBody: text('email_body').notNull(),
    whatsappBody: text('whatsapp_body').notNull(),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    pageIdx: index('idx_communication_template_master_t_page').on(t.pageSlug, t.trigger),
    triggerCheck: check(
      'communication_template_master_t_trigger_check',
      sql`${t.trigger} IN ('create', 'field_change', 'event', 'manual')`,
    ),
    recipientCheck: check(
      'communication_template_master_t_recipient_check',
      sql`${t.recipient} IN ('client', 'client_payment', 'client_all')`,
    ),
  }),
);

export type CommunicationTemplateRow = typeof communicationTemplateMaster.$inferSelect;
