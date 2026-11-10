import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { usersT } from './users';

// AI Search conversations: one user's chat with the assistant, kept so it can
// be reopened and continued.
//
// The turns are a JSONB column, not a child table (§4.5): a conversation is
// only ever read whole, by its owner, and a turn is appended in the same UPDATE
// that bumps `updated_at` — there is nothing to query across turns.
//
// What a turn stores is what the screen drew: the question, the answer text,
// and the figures / record cards it showed. A reopened conversation re-renders
// from this; it does NOT re-run the lookups, so a card shows the status as it
// was when asked. The assistant is told the same, and re-checks with its tools
// whenever a follow-up depends on the current state.

/** A headline number the answer panel drew as a tile. */
export interface AiTurnFigure {
  label: string;
  value: number;
  tone?: string;
}

/** A record card the answer panel drew. Mirrors AiRecord (db/queries/aiSearch). */
export interface AiTurnRecord {
  module: string;
  module_label: string;
  id: number;
  reference: string | null;
  client: string | null;
  status: string | null;
  date: string | null;
  date_label: string | null;
  link: string;
}

export interface AiTurn {
  role: 'user' | 'assistant';
  /** The question, or the answer text. */
  content: string;
  /** ISO timestamp. */
  at: string;
  /** Assistant turns only. */
  figures?: AiTurnFigure[];
  records?: AiTurnRecord[];
  steps?: string[];
}

export const aiConversation = pgTable(
  'ai_conversation_t',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersT.id, { onDelete: 'cascade' }),
    /** The first question, shortened — what the sidebar lists it as. */
    title: varchar('title', { length: 120 }).notNull(),
    messages: jsonb('messages').$type<AiTurn[]>().notNull().default(sql`'[]'::jsonb`),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // The sidebar: "my conversations, most recent first".
    userRecentIdx: index('idx_ai_conversation_t_user_recent').on(t.userId, t.updatedAt),
  }),
);

export type AiConversationRow = typeof aiConversation.$inferSelect;
