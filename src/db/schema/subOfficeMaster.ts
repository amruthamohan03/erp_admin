// Minimal master for customs declaration offices (declaration_office_id on
// imports_t). The source `sub_office_master_t` DDL wasn't provided, so this is a
// minimal id+name master; extend if the real definition becomes available.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const subOfficeMaster = pgTable('sub_office_master_t', {
  id: serial('id').primaryKey(),
  subOfficeName: varchar('sub_office_name', { length: 255 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id),
  updatedBy: integer('updated_by').references(() => usersT.id),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type SubOfficeMasterRow = typeof subOfficeMaster.$inferSelect;
export type SubOfficeMasterInsert = typeof subOfficeMaster.$inferInsert;
