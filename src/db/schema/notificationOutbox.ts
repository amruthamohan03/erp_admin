import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';

// Notification outbox per CLAUDE.md §4.6.
//
// Transactional table (not a master). One row per notify side-effect that
// case-runtime's advanceCase produces. Inserted in the same transaction
// that writes the entity update, so either both land or neither does — the
// classic outbox pattern. A separate dispatcher worker (future slice)
// polls `status='pending'` rows and actually sends them.
//
// No FK back to a case: target_table is dynamic, so we store template_key +
// case_id as a textual link admins can join through manually if needed.
//
// status conventions:
//   pending   — newly written by advanceCase, not yet dispatched
//   sent      — dispatcher delivered to the provider successfully
//   failed    — dispatcher gave up after attempts ran out
//   cancelled — admin-cancelled before dispatch (rare)

export const notificationOutbox = pgTable('notification_outbox_t', {
  id: serial('id').primaryKey(),
  // 'email' | 'sms' | 'in_app' — kept as string so a new channel doesn't
  // need a migration; dispatcher matches strings to providers at runtime.
  channel: varchar('channel', { length: 30 }).notNull(),
  // The resolved recipient — already evaluated against the rule context
  // (e.g. JSON Logic { var: "entity.client_email" } → "client@example.com").
  recipient: text('recipient').notNull(),
  template: varchar('template', { length: 100 }).notNull(),
  // Optional extra data the dispatcher renders into the template.
  payload: jsonb('payload'),
  templateKey: varchar('template_key', { length: 100 }),
  caseId: integer('case_id'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: false }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type NotificationOutboxRow = typeof notificationOutbox.$inferSelect;
export type NotificationOutboxInsert = typeof notificationOutbox.$inferInsert;
