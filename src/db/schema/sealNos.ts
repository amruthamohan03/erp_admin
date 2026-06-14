// Seal master / purchase batch (seal_nos_t). One row per seal purchase at an
// office location; individual seal numbers hang off it in seal_individual_numbers_t.
import {
  pgTable, serial, integer, varchar, text, date, numeric, timestamp, index, type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { mainOfficeMaster } from './mainOfficeMaster';

export const sealNos = pgTable(
  'seal_nos_t',
  {
    id: serial('id').primaryKey(),
    officeLocationId: integer('office_location_id').references((): AnyPgColumn => mainOfficeMaster.id),
    purchaseDate: date('purchase_date'),
    totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    totalSeal: integer('total_seal').notNull().default(0),
    subOfficeCode: text('sub_office_code'),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references((): AnyPgColumn => usersT.id),
    updatedBy: integer('updated_by').references((): AnyPgColumn => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    officeIdx: index('idx_seal_nos_t_office').on(t.officeLocationId),
    purchaseIdx: index('idx_seal_nos_t_purchase_date').on(t.purchaseDate),
    displayIdx: index('idx_seal_nos_t_display').on(t.display),
  }),
);

export type SealNosRow = typeof sealNos.$inferSelect;
export type SealNosInsert = typeof sealNos.$inferInsert;
