import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Communication → Live Chat: one row per message one signed-in user sends to
// another. A conversation is not a row of its own — it is the messages between
// two users, so there is nothing to create before the first message and nothing
// to keep in step after it.
//
// Distinct from the role inbox (notification_t, kind 'message'): that is a
// one-way note to every member of a role, this is a back-and-forth between two
// people. Messages are never edited; `read_at` is the only column that changes.
export const chatMessage = pgTable(
  'chat_message_t',
  {
    id: serial('id').primaryKey(),
    senderUserId: integer('sender_user_id')
      .notNull()
      .references(() => usersT.id),
    recipientUserId: integer('recipient_user_id')
      .notNull()
      .references(() => usersT.id),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // The unread badge: "messages to me, not yet read".
    recipientUnreadIdx: index('idx_chat_message_t_recipient_unread').on(t.recipientUserId, t.readAt),
    // One conversation, newest first, from either side.
    pairIdx: index('idx_chat_message_t_pair').on(t.senderUserId, t.recipientUserId, t.id),
    notSelf: check('chat_message_t_not_self', sql`${t.senderUserId} <> ${t.recipientUserId}`),
    bodyLength: check('chat_message_t_body_length', sql`char_length(${t.body}) between 1 and 2000`),
  }),
);
