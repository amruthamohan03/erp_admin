// TODO(config): move to master_* per CLAUDE.md §4.1; keeping `incoterm_master_t`
// because the user asked to mirror the source DB naming exactly.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const incotermMaster = pgTable('incoterm_master_t', {
  id: serial('id').primaryKey(),
  incotermShortName: varchar('incoterm_short_name', { length: 10 }).notNull(),
  incotermFullName: varchar('incoterm_full_name', { length: 250 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id),
  updatedBy: integer('updated_by').references(() => usersT.id),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type IncotermMasterRow = typeof incotermMaster.$inferSelect;
export type IncotermMasterInsert = typeof incotermMaster.$inferInsert;
