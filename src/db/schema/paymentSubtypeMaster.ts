// Payment subtype master (customs regime codes). Backs the license
// "Payment Subtype" select (licenses_t.payment_subtype_id). Each subtype belongs
// to a payment_type (IMPORT / EXPORT) via payment_type_id. Mirrors the source
// `payment_subtype_master_t`.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { paymentTypeMaster } from './paymentTypeMaster';

export const paymentSubtypeMaster = pgTable(
  'payment_subtype_master_t',
  {
    id: serial('id').primaryKey(),
    paymentTypeId: integer('payment_type_id')
      .notNull()
      .references(() => paymentTypeMaster.id),
    paymentSubtype: varchar('payment_subtype', { length: 100 }).notNull(),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id),
    updatedBy: integer('updated_by').references(() => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    paymentTypeIdx: index('idx_payment_subtype_master_t_type').on(t.paymentTypeId),
  }),
);

export type PaymentSubtypeMasterRow = typeof paymentSubtypeMaster.$inferSelect;
export type PaymentSubtypeMasterInsert = typeof paymentSubtypeMaster.$inferInsert;
