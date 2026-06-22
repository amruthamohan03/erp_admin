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
