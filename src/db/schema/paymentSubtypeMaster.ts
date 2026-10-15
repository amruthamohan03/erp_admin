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
import { paymentMethodMaster } from './paymentMethodMaster';

// Payment subtype catalogue — nested under a Payment Method ("SWIFT" under
// "Bank transfer"), so the licence form's Payment Subtype lists only the
// subtypes of the method picked (0141). payment_type_id is kept: it still
// records the EXPORT/IMPORT direction of the DRC modality codes, but it no
// longer scopes any picker.

export const paymentSubtypeMaster = pgTable(
  'payment_subtype_master_t',
  {
    id: serial('id').primaryKey(),
    paymentTypeId: integer('payment_type_id').references(
      () => paymentTypeMaster.id,
      { onDelete: 'set null' },
    ),
    paymentMethodId: integer('payment_method_id').references(
      () => paymentMethodMaster.id,
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
    methodIdx: index('idx_payment_subtype_master_t_method').on(t.paymentMethodId),
  }),
);

export const paymentSubtypeMasterRelations = relations(
  paymentSubtypeMaster,
  ({ one }) => ({
    paymentType: one(paymentTypeMaster, {
      fields: [paymentSubtypeMaster.paymentTypeId],
      references: [paymentTypeMaster.id],
    }),
    paymentMethod: one(paymentMethodMaster, {
      fields: [paymentSubtypeMaster.paymentMethodId],
      references: [paymentMethodMaster.id],
    }),
  }),
);

export type PaymentSubtypeMasterRow = typeof paymentSubtypeMaster.$inferSelect;
export type PaymentSubtypeMasterInsert =
  typeof paymentSubtypeMaster.$inferInsert;
