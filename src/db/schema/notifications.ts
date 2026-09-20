import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { roleMaster } from './roles';

// In-app notifications and role-to-role messages (§4.6 side effects, surfaced).
//
// ONE inbox for both, because an operator reads them in one place — the bell in
// the header and the dashboard:
//
//   * kind 'event'   — raised by the system when something changes status
//                      (a payment approved, an invoice validated, a fiche
//                      audited, a file cancelled). WHICH roles hear about an
//                      event, and what it says, is notification_event_master_t
//                      — configuration, not code (§4.1).
//   * kind 'message' — written by a person in one role to one or more roles.
//
// A notification is addressed to roles and/or to single users
// (notification_recipient_t), and each user marks it read for themselves
// (notification_read_t), so one message to a role of twenty people is one row,
// not twenty, and one person reading it does not read it for the others.

export const NOTIFICATION_KINDS = ['event', 'message'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const NOTIFICATION_PRIORITIES = ['normal', 'high'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

/** What each system event says, and to whom. Edited under Masters → Notification Events. */
export const notificationEventMaster = pgTable('notification_event_master_t', {
  id: serial('id').primaryKey(),
  /** Stable key the code raises, e.g. `payment.rejected`. Never edited. */
  eventKey: varchar('event_key', { length: 100 }).notNull().unique(),
  module: varchar('module', { length: 60 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  /** `{token}` placeholders, filled from the event's context — see renderTemplate. */
  titleTemplate: varchar('title_template', { length: 200 }).notNull(),
  messageTemplate: text('message_template').notNull(),
  /** Where the notification opens, e.g. `/payments`. */
  linkTemplate: varchar('link_template', { length: 300 }),
  /** Also tell the person who created the record (a requester hearing their request was approved). */
  notifyCreator: boolean('notify_creator').notNull().default(true),
  priority: varchar('priority', { length: 10 }).notNull().default('normal'),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

/** The roles an event is announced to. */
export const notificationEventRole = pgTable(
  'notification_event_role_t',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => notificationEventMaster.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roleMaster.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pairUq: uniqueIndex('uq_notification_event_role').on(t.eventId, t.roleId) }),
);

export const notification = pgTable(
  'notification_t',
  {
    id: serial('id').primaryKey(),
    kind: varchar('kind', { length: 10 }).notNull(),
    /** Set for kind 'event'. */
    eventKey: varchar('event_key', { length: 100 }),
    module: varchar('module', { length: 60 }),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    linkUrl: varchar('link_url', { length: 300 }),
    priority: varchar('priority', { length: 10 }).notNull().default('normal'),
    senderUserId: integer('sender_user_id').references(() => usersT.id, { onDelete: 'set null' }),
    senderRoleId: integer('sender_role_id').references(() => roleMaster.id, { onDelete: 'set null' }),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    kindIdx: index('idx_notification_t_kind').on(t.kind, t.createdAt),
    senderIdx: index('idx_notification_t_sender').on(t.senderUserId),
  }),
);

/** Who a notification is for: a role, or one user. Exactly one is set (CHECK in 0108). */
export const notificationRecipient = pgTable(
  'notification_recipient_t',
  {
    id: serial('id').primaryKey(),
    notificationId: integer('notification_id')
      .notNull()
      .references(() => notification.id, { onDelete: 'cascade' }),
    roleId: integer('role_id').references(() => roleMaster.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => usersT.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    notificationIdx: index('idx_notification_recipient_notification').on(t.notificationId),
    roleIdx: index('idx_notification_recipient_role').on(t.roleId),
    userIdx: index('idx_notification_recipient_user').on(t.userId),
  }),
);

/** One row per user who has read a notification. */
export const notificationRead = pgTable(
  'notification_read_t',
  {
    notificationId: integer('notification_id')
      .notNull()
      .references(() => notification.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => usersT.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.notificationId, t.userId] }) }),
);

export type NotificationEventMasterRow = typeof notificationEventMaster.$inferSelect;
export type NotificationRow = typeof notification.$inferSelect;
