// TODO(config): move to master_* per CLAUDE.md §4.1; keeping `main_office_master_t`
// because the user asked to mirror the source DB naming exactly.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const mainOfficeMaster = pgTable('main_office_master_t', {
  id: serial('id').primaryKey(),
  mainLocationName: varchar('main_location_name', { length: 255 }),
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

export type MainOfficeMasterRow = typeof mainOfficeMaster.$inferSelect;
export type MainOfficeMasterInsert = typeof mainOfficeMaster.$inferInsert;
