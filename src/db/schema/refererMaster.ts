// TODO(config): move to master_* per CLAUDE.md §4.1; keeping `refferer_master_t`
// because the user asked to mirror the source DB naming exactly.
// NOTE: the source dump misspells "referrer" as "refferer" (two f's, one r).
// This is preserved 1:1 to match the existing schema. Don't "fix" it without
// also coordinating a rename migration in the source DB.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const refererMaster = pgTable('refferer_master_t', {
  id: serial('id').primaryKey(),
  refererName: varchar('refferer_name', { length: 255 }).notNull(),
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

export type RefererMasterRow = typeof refererMaster.$inferSelect;
export type RefererMasterInsert = typeof refererMaster.$inferInsert;
