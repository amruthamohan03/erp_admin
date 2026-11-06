import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Clearing status — where a customs clearance currently sits in the
// operational pipeline ("Pre-Alert", "Declaration Submitted", "Released",
// etc.). imports_t carries a clearing_status FK to track progress
// alongside the workflow state.

export const clearingStatusMaster = pgTable('clearing_status_master_t', {
  id: serial('id').primaryKey(),
  clearingStatus: varchar('clearing_status', { length: 100 }).notNull(),
  /**
   * §4.38 — the badge hue this status wears in every list, from the statusTone
   * palette (TONE_KEYS). NULL means "not configured": the badge then falls back
   * to the hue its WORDS imply, so a status added later still reads sensibly.
   * Configured so the six clearing statuses can each be told apart at a glance,
   * where the word-based reading gives three of them the same green.
   */
  tone: varchar('tone', { length: 20 }),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  updatedBy: integer('updated_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type ClearingStatusMasterRow = typeof clearingStatusMaster.$inferSelect;
export type ClearingStatusMasterInsert = typeof clearingStatusMaster.$inferInsert;
