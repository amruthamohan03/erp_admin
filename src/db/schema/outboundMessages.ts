import { sql } from 'drizzle-orm';
import {
  check,
  type AnyPgColumn,
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
// was attempted rather than nothing. An automatic stage message starts as
// `queued` instead: it is written inside the transaction that changed the
// record and sent after that transaction commits. Attachments are files_t rows with
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
    // The stage record a message is about (a page slug + its id) and the
    // communication template it was rendered from — null for a message written
    // freehand on the Email & WhatsApp screen.
    entityType: varchar('entity_type', { length: 60 }),
    entityId: integer('entity_id'),
    templateKey: varchar('template_key', { length: 100 }),
    // `auto` — queued by a stage change and sent once that change committed.
    origin: varchar('origin', { length: 10 }).notNull().default('manual'),
    // A bulk send by condition writes one row per client. The attachments are
    // stored once, on the batch's first row, and every other row points at it
    // — so fifty clients do not mean fifty copies of the same PDF.
    bulkParentId: integer('bulk_parent_id').references((): AnyPgColumn => outboundMessage.id, { onDelete: 'set null' }),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
  },
  (t) => ({
    createdIdx: index('idx_outbound_message_t_created').on(t.createdAt),
    entityIdx: index('idx_outbound_message_t_entity').on(t.entityType, t.entityId),
    bulkParentIdx: index('idx_outbound_message_t_bulk_parent').on(t.bulkParentId).where(sql`${t.bulkParentId} IS NOT NULL`),
    queuedIdx: index('idx_outbound_message_t_queued').on(t.id).where(sql`${t.status} = 'queued'`),
    originCheck: check('outbound_message_t_origin_check', sql`${t.origin} IN ('manual', 'auto')`),
    channelCheck: check('outbound_message_t_channel_check', sql`${t.channel} IN ('email', 'whatsapp')`),
    statusCheck: check(
      'outbound_message_t_status_check',
      sql`${t.status} IN ('queued', 'sending', 'sent', 'partial', 'failed')`,
    ),
  }),
);

export type OutboundMessageRow = typeof outboundMessage.$inferSelect;
