// TODO(config): move to master_* per CLAUDE.md §4.1; keeping `group_company_master_t`
// because the user asked to mirror the source DB naming exactly.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const groupCompanyMaster = pgTable('group_company_master_t', {
  id: serial('id').primaryKey(),
  groupCompanyName: varchar('group_company_name', { length: 255 }).notNull(),
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

export type GroupCompanyMasterRow = typeof groupCompanyMaster.$inferSelect;
export type GroupCompanyMasterInsert = typeof groupCompanyMaster.$inferInsert;
