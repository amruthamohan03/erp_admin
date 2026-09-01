import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { usersT } from './users';

// How a licence is paid for (Cash, Bank Transfer, Cheque, Letter of Credit).
// Distinct from `payment_type_master_t`, which holds EXPORT/IMPORT and scopes the
// customs payment SUBtypes — the two were conflated, which is why the License
// form's Payment Method dropdown listed "EXPORT" and "IMPORT".

export const paymentMethodMaster = pgTable('payment_method_master_t', {
  id: serial('id').primaryKey(),
  paymentMethodName: varchar('payment_method_name', { length: 150 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type PaymentMethodMasterRow = typeof paymentMethodMaster.$inferSelect;
export type PaymentMethodMasterInsert = typeof paymentMethodMaster.$inferInsert;
