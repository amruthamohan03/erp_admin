import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// "Done by" attribution catalogue — short name strings used on
// operational tracking entries to record which team / external party
// performed a step. Adapted from main's `done_by_t` to the
// `_master_t` naming convention.
//
// The `done_by_name` is unique — the picker shows one row per
// distinct attribution.

export const doneByMaster = pgTable('done_by_master_t', {
  id: serial('id').primaryKey(),
  doneByName: varchar('done_by_name', { length: 50 }).notNull().unique(),
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

export type DoneByMasterRow = typeof doneByMaster.$inferSelect;
export type DoneByMasterInsert = typeof doneByMaster.$inferInsert;
