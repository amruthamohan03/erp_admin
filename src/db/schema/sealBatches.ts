import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  date,
  numeric,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { mainOfficeMaster } from './mainOfficeMaster';
import { usersT } from './users';

// Seal purchase batch — one row per bulk seal purchase at an office.
// Individual seal numbers hang off seal_individual_numbers_t via
// seal_batch_id. total_seal is derived from total_amount via the fixed
// SEAL_UNIT_PRICE constant; the column is denormalized for fast batch
// listings (we don't want to count() every individual row to display the
// batch list).
//
// Adapted from main-branch `seal_nos_t`. Renamed to `seal_batch_t` per
// §4.1 — `_nos_t` was a legacy compression of "numbers" that read as a
// typo against the actual seal_individual_numbers child table.

export const sealBatch = pgTable(
  'seal_batch_t',
  {
    id: serial('id').primaryKey(),
    officeLocationId: integer('office_location_id').references(
      () => mainOfficeMaster.id,
      { onDelete: 'restrict' },
    ),
    purchaseDate: date('purchase_date'),
    totalAmount: numeric('total_amount', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    totalSeal: integer('total_seal').notNull().default(0),
    // Free-form text — historically a sub-office identifier. NOT an FK
    // because there's no sub_office_master_t on this branch and main also
    // used it as a string.
    subOfficeCode: text('sub_office_code'),
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
    officeIdx: index('idx_seal_batch_t_office').on(t.officeLocationId),
    purchaseIdx: index('idx_seal_batch_t_purchase_date').on(t.purchaseDate),
    displayIdx: index('idx_seal_batch_t_display').on(t.display),
  }),
);

export const sealBatchRelations = relations(sealBatch, ({ one }) => ({
  office: one(mainOfficeMaster, {
    fields: [sealBatch.officeLocationId],
    references: [mainOfficeMaster.id],
  }),
}));

export type SealBatchRow = typeof sealBatch.$inferSelect;
export type SealBatchInsert = typeof sealBatch.$inferInsert;
