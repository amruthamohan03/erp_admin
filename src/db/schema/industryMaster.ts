import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const industryMaster = pgTable('industry_master_t', {
  id: serial('id').primaryKey(),
  industryName: varchar('industry_name', { length: 200 }).notNull(),
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

export type IndustryMasterRow = typeof industryMaster.$inferSelect;
export type IndustryMasterInsert = typeof industryMaster.$inferInsert;
