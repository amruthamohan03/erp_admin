import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const expenseTypeMaster = pgTable('expense_type_master_t', {
  id: serial('id').primaryKey(),
  expenseTypeName: varchar('expense_type_name', { length: 300 }).notNull(),
  isImport: boolean('import').notNull().default(false),
  isExport: boolean('export').notNull().default(false),
  isLocal: boolean('local').notNull().default(false),
  isAdvance: boolean('advance').notNull().default(false),
  isOther: boolean('other').notNull().default(false),
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

export type ExpenseTypeMasterRow = typeof expenseTypeMaster.$inferSelect;
export type ExpenseTypeMasterInsert = typeof expenseTypeMaster.$inferInsert;
