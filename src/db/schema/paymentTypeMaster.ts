import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Payment method catalogue ("Bank transfer", "Cash", "Cheque",
// "Mobile money"). Parent FK for `payment_subtype_master_t` —
// each type can have multiple subtypes (e.g. Bank transfer →
// SWIFT / domestic / SEPA).

export const paymentTypeMaster = pgTable('payment_type_master_t', {
  id: serial('id').primaryKey(),
  paymentTypeName: varchar('payment_type_name', { length: 250 }).notNull(),
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

export type PaymentTypeMasterRow = typeof paymentTypeMaster.$inferSelect;
export type PaymentTypeMasterInsert = typeof paymentTypeMaster.$inferInsert;
