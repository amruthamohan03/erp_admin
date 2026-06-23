import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Expense type catalogue for invoice/payment-request line items
// ("Customs duty", "Inspection fee", "Transit warehousing", …).
//
// Five boolean flags scope which contexts each expense type can be
// picked in: imports, exports, local, advance, other. Pickers in
// downstream modules filter on the relevant flag — the imports
// invoice form, for example, would query `is_import=true` only.
// Multiple flags can be set on the same row (a generic charge
// applies to both imports and exports).
//
// Renamed from main's bare column names (`import`, `export`, `local`,
// `advance`, `other`) to `is_*` to avoid SQL reserved-word collisions
// and read more clearly as predicates.

export const expenseTypeMaster = pgTable('expense_type_master_t', {
  id: serial('id').primaryKey(),
  expenseTypeName: varchar('expense_type_name', { length: 300 }).notNull(),
  isImport: boolean('is_import').notNull().default(false),
  isExport: boolean('is_export').notNull().default(false),
  isLocal: boolean('is_local').notNull().default(false),
  isAdvance: boolean('is_advance').notNull().default(false),
  isOther: boolean('is_other').notNull().default(false),
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

export type ExpenseTypeMasterRow = typeof expenseTypeMaster.$inferSelect;
export type ExpenseTypeMasterInsert = typeof expenseTypeMaster.$inferInsert;
