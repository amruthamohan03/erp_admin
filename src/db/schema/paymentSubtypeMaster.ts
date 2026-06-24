import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { paymentTypeMaster } from './paymentTypeMaster';

// Payment subtype catalogue — nested under payment_type
// ("SWIFT" under "Bank transfer", "Airtel Money" under "Mobile
// money"). FK to payment_type_master_t so pickers can scope to
// "subtypes of Bank Transfer" without listing all subtypes.

export const paymentSubtypeMaster = pgTable(
  'payment_subtype_master_t',
  {
    id: serial('id').primaryKey(),
    paymentTypeId: integer('payment_type_id').references(
      () => paymentTypeMaster.id,
      { onDelete: 'set null' },
    ),
    paymentSubtype: varchar('payment_subtype', { length: 100 }).notNull(),
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
  },
  (t) => ({
    typeIdx: index('idx_payment_subtype_master_t_type').on(t.paymentTypeId),
  }),
);

export const paymentSubtypeMasterRelations = relations(
  paymentSubtypeMaster,
  ({ one }) => ({
    paymentType: one(paymentTypeMaster, {
      fields: [paymentSubtypeMaster.paymentTypeId],
      references: [paymentTypeMaster.id],
    }),
  }),
);

export type PaymentSubtypeMasterRow = typeof paymentSubtypeMaster.$inferSelect;
export type PaymentSubtypeMasterInsert =
  typeof paymentSubtypeMaster.$inferInsert;
