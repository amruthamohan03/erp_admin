import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Group / parent company catalogue. Clients that belong to a larger
// holding group reference their group_company here so reporting can
// roll up consignment totals per group.

export const groupCompanyMaster = pgTable('group_company_master_t', {
  id: serial('id').primaryKey(),
  groupCompanyName: varchar('group_company_name', { length: 255 }).notNull(),
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

export type GroupCompanyMasterRow = typeof groupCompanyMaster.$inferSelect;
export type GroupCompanyMasterInsert =
  typeof groupCompanyMaster.$inferInsert;
