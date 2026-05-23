import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const departmentMaster = pgTable('department_master_t', {
  id: serial('id').primaryKey(),
  departmentName: varchar('department_name', { length: 100 }).notNull(),
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

export type DepartmentMasterRow = typeof departmentMaster.$inferSelect;
export type DepartmentMasterInsert = typeof departmentMaster.$inferInsert;
