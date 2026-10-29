import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Communication → Email & WhatsApp: one row per message sent to people outside
// the system. The row is written BEFORE the provider is called (status
// `sending`) and finished after, so a crash mid-send leaves a record of what
// was attempted rather than nothing. Attachments are files_t rows with
// entity_type `outbound_message` and entity_id this id.
//
// The status set is the send lifecycle, not business configuration — the
// same reasoning as notification_outbox_t.status.

/** How one recipient fared, as the provider reported it. */
export interface OutboundResult {
  recipient: string;
  status: 'sent' | 'failed';
  /** The provider's message id — what support asks for when tracing a delivery. */
  provider_id?: string;
  error?: string;
}

export const outboundMessage = pgTable(
  'outbound_message_t',
  {
    id: serial('id').primaryKey(),
    channel: varchar('channel', { length: 20 }).notNull(),
    toRecipients: jsonb('to_recipients').$type<string[]>().notNull().default([]),
    ccRecipients: jsonb('cc_recipients').$type<string[]>().notNull().default([]),
    bccRecipients: jsonb('bcc_recipients').$type<string[]>().notNull().default([]),
    subject: varchar('subject', { length: 200 }).notNull().default(''),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('sending'),
    error: text('error'),
    results: jsonb('results').$type<OutboundResult[]>().notNull().default([]),
    attachmentCount: integer('attachment_count').notNull().default(0),
    sentBy: integer('sent_by').references(() => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
  },
  (t) => ({
    createdIdx: index('idx_outbound_message_t_created').on(t.createdAt),
    channelCheck: check('outbound_message_t_channel_check', sql`${t.channel} IN ('email', 'whatsapp')`),
    statusCheck: check(
      'outbound_message_t_status_check',
      sql`${t.status} IN ('sending', 'sent', 'partial', 'failed')`,
    ),
  }),
);

export type OutboundMessageRow = typeof outboundMessage.$inferSelect;
