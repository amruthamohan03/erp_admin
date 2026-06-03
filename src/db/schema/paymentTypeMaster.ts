// Payment type master (IMPORT / EXPORT). Backs the license "Payment Method"
// select (licenses_t.payment_method_id) and is the parent of
// payment_subtype_master_t. Mirrors the source `payment_type_master_t`.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const paymentTypeMaster = pgTable('payment_type_master_t', {
  id: serial('id').primaryKey(),
  paymentTypeName: varchar('payment_type_name', { length: 250 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id),
  updatedBy: integer('updated_by').references(() => usersT.id),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type PaymentTypeMasterRow = typeof paymentTypeMaster.$inferSelect;
export type PaymentTypeMasterInsert = typeof paymentTypeMaster.$inferInsert;
