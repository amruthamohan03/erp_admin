// Import/Export license — the consignment-license stage of the lifecycle (§2).
// Mirrors the source `licenses_t` MySQL table.
//
// NOTE on nullability: the source marks license_number, client_id,
// type_of_goods_id, transport_mode_id and currency_id as NOT NULL. The §4.12
// transactional-page runtime saves ONE accordion at a time and INSERTs a new row
// from whichever accordion is saved first, so those columns cannot all be
// satisfied on the initial create (they live in different accordions). They are
// therefore nullable here; presence is enforced per-accordion via each field's
// `required` flag in master_page_accordion_field_t (see 0050_seed_licenses_page).
//
// TODO(storage): invoice_file / license_file are varchar paths mirroring the
// source dump. Per CLAUDE.md §4.11 these should become *_file_id FKs to a `files`
// table in S3 once that lands.
import {
  pgTable,
  serial,
  varchar,
  integer,
  date,
  numeric,
  timestamp,
  type AnyPgColumn,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';
import { banklistMaster } from './banklistMaster';
import { clients } from './clients';
import { doneBy } from './doneBy';
import { transitPointMaster } from './transitPointMaster';
import { typeOfGoodsMaster } from './typeOfGoodsMaster';
import { unitMaster } from './unitMaster';
import { transportModeMaster } from './transportModeMaster';
import { currencyMaster } from './currencyMaster';
import { kindMaster } from './kindMaster';
import { originMaster } from './originMaster';
import { paymentTypeMaster } from './paymentTypeMaster';
import { paymentSubtypeMaster } from './paymentSubtypeMaster';

export const licenses = pgTable(
  'licenses_t',
  {
    id: serial('id').primaryKey(),
    licenseNumber: varchar('license_number', { length: 50 }),

    bankId: integer('bank_id').references(() => banklistMaster.id),
    clientId: integer('client_id').references(() => clients.id),
    licenseClearedBy: integer('license_cleared_by').references(() => doneBy.id),
    entryPostId: integer('entry_post_id').references(() => transitPointMaster.id),
    refCod: varchar('ref_cod', { length: 50 }),

    typeOfGoodsId: integer('type_of_goods_id').references(() => typeOfGoodsMaster.id),
    weight: numeric('weight', { precision: 10, scale: 2 }),
    m3: numeric('m3', { precision: 10, scale: 2 }),
    unitOfMeasurementId: integer('unit_of_measurement_id').references(() => unitMaster.id),

    fobDeclared: numeric('fob_declared', { precision: 15, scale: 2 }),
    insurance: numeric('insurance', { precision: 15, scale: 2 }),
    freight: numeric('freight', { precision: 15, scale: 2 }),
    otherCosts: numeric('other_costs', { precision: 15, scale: 2 }),

    transportModeId: integer('transport_mode_id').references(() => transportModeMaster.id),
    invoiceNumber: varchar('invoice_number', { length: 50 }),
    invoiceFile: varchar('invoice_file', { length: 255 }),
    invoiceDate: date('invoice_date'),
    currencyId: integer('currency_id').references(() => currencyMaster.id),
    supplier: varchar('supplier', { length: 255 }),

    licenseAppliedDate: date('license_applied_date'),
    licenseValidationDate: date('license_validation_date'),
    licenseExpiryDate: date('license_expiry_date'),
    licenseFile: varchar('license_file', { length: 255 }),

    kindId: integer('kind_id').references(() => kindMaster.id),
    // payment_method_id stores a payment_type_master_t id (the "Payment Method"
    // select is backed by IMPORT/EXPORT payment types in the source).
    paymentMethodId: integer('payment_method_id').references(() => paymentTypeMaster.id),
    paymentSubtypeId: integer('payment_subtype_id').references(() => paymentSubtypeMaster.id),
    destinationId: integer('destination_id').references(() => originMaster.id),

    fsi: varchar('fsi', { length: 100 }),
    aur: varchar('aur', { length: 100 }),
    // CHECK constraint in migration restricts to the status enum.
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),

    // Per-amount currency overrides — default to currency id 1 (USD) like the source.
    fobCurrencyId: integer('fob_currency_id').default(1).references(() => currencyMaster.id),
    insuranceCurrencyId: integer('insurance_currency_id').default(1).references(() => currencyMaster.id),
    freightCurrencyId: integer('freight_currency_id').default(1).references(() => currencyMaster.id),
    otherCostsCurrencyId: integer('other_costs_currency_id').default(1).references(() => currencyMaster.id),

    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references((): AnyPgColumn => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedBy: integer('updated_by').references((): AnyPgColumn => usersT.id),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // Partial uniques: allow many in-progress rows with no number yet, but keep
    // real license/invoice numbers unique. (Source had plain UNIQUE NOT NULL;
    // relaxed for the incremental per-accordion create flow.)
    licenseNumberUq: uniqueIndex('uq_licenses_t_license_number')
      .on(t.licenseNumber)
      .where(sql`${t.licenseNumber} IS NOT NULL AND ${t.licenseNumber} <> ''`),
    invoiceNumberUq: uniqueIndex('uq_licenses_t_invoice_number')
      .on(t.invoiceNumber)
      .where(sql`${t.invoiceNumber} IS NOT NULL AND ${t.invoiceNumber} <> ''`),
    clientIdx: index('idx_licenses_t_client').on(t.clientId),
    kindIdx: index('idx_licenses_t_kind').on(t.kindId),
    transportIdx: index('idx_licenses_t_transport').on(t.transportModeId),
    displayLicenseIdx: index('idx_licenses_t_display_license').on(t.display, t.licenseNumber),
  }),
);

export type LicenseRow = typeof licenses.$inferSelect;
export type LicenseInsert = typeof licenses.$inferInsert;
