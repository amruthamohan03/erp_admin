// Import Tracking — the import-tracking stage of the consignment lifecycle (§2).
// Mirrors the source `imports_t` MySQL table.
//
// Deviations from source (deliberate):
//   * `subscriber_id` (FK to clients) is renamed `client_id` per the user's note.
//   * `id` is `serial` (int) not `bigint` — consistent with every other table here;
//     6.5k rows is far within int range.
//   * NOT NULL business columns (client_id, license_id, mca_ref, pre_alert_date,
//     invoice, weight, fob) are nullable here — the §4.12 runtime INSERTs a new
//     row from a single accordion, so cross-accordion NOT NULLs can't be met on
//     create. Presence is enforced per-field via `required` in
//     master_page_accordion_field_t (see 0052_seed_imports_page).
//
// TODO(storage): file/reference fields stay varchar; per §4.11 true uploads
// (inspection_reports, etc.) should move to S3 + a files table later.
import {
  pgTable,
  serial,
  varchar,
  jsonb,
  text,
  integer,
  date,
  numeric,
  boolean,
  timestamp,
  type AnyPgColumn,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';
import { clientMaster } from './clients';
import { licenseT } from './license';
import { partialMaster } from './partialMaster';
import { kindMaster } from './kindMaster';
import { typeOfGoodsMaster } from './typeOfGoodsMaster';
import { transportModeMaster } from './transportModeMaster';
import { currencyMaster } from './currencyMaster';
import { regimeMaster } from './regimeMaster';
import { clearanceMaster } from './clearanceMaster';
import { subOfficeMaster } from './subOfficeMaster';
import { commodityMaster } from './commodityMaster';
import { transitPointMaster } from './transitPointMaster';
import { documentStatusMaster } from './documentStatusMaster';
import { clearingStatusMaster } from './clearingStatusMaster';
import { clearingBasisMaster } from './clearingBasisMaster';
import { truckStatusMaster } from './truckStatusMaster';

/** One entry in a consignment's dated remarks log (the `remarks` column). */
export interface RemarkLine {
  /** ISO YYYY-MM-DD — the business date of the remark, not when it was typed. */
  date: string;
  remark: string;
}

export const importT = pgTable(
  'imports_t',
  {
    id: serial('id').primaryKey(),

    // ── Basic ──
    clientId: integer('client_id').references((): AnyPgColumn => clientMaster.id),
    licenseId: integer('license_id').references((): AnyPgColumn => licenseT.id),
    partialId: integer('partial_id').references(() => partialMaster.id),
    kind: integer('kind').references(() => kindMaster.id),
    typeOfGoods: integer('type_of_goods').references(() => typeOfGoodsMaster.id),
    transportMode: integer('transport_mode').references(() => transportModeMaster.id),
    mcaRef: varchar('mca_ref', { length: 100 }),
    currency: integer('currency').references(() => currencyMaster.id),
    licenseInvoiceNumber: varchar('license_invoice_number', { length: 100 }),
    supplier: varchar('supplier', { length: 255 }),
    regime: integer('regime').references(() => regimeMaster.id),
    typesOfClearance: integer('types_of_clearance').references(() => clearanceMaster.id),
    declarationOfficeId: integer('declaration_office_id').references(() => subOfficeMaster.id),
    preAlertDate: date('pre_alert_date'),
    invoice: varchar('invoice', { length: 100 }),
    commodity: integer('commodity').references(() => commodityMaster.id),
    poRef: varchar('po_ref', { length: 100 }),

    // ── Financial ──
    fret: numeric('fret', { precision: 15, scale: 2 }),
    fretCurrency: integer('fret_currency').references(() => currencyMaster.id),
    otherCharges: numeric('other_charges', { precision: 15, scale: 2 }),
    otherChargesCurrency: integer('other_charges_currency').references(() => currencyMaster.id),
    weight: numeric('weight', { precision: 15, scale: 2 }),
    remWeight: numeric('rem_weight', { precision: 15, scale: 2 }),
    m3: numeric('m3', { precision: 10, scale: 2 }),
    cessionDate: date('cession_date'),
    fob: numeric('fob', { precision: 15, scale: 2 }),
    rFob: numeric('r_fob', { precision: 15, scale: 2 }),
    rFobCurrency: integer('r_fob_currency').references(() => currencyMaster.id),
    fobCurrency: integer('fob_currency').references(() => currencyMaster.id),
    insuranceDate: date('insurance_date'),
    insuranceAmount: numeric('insurance_amount', { precision: 15, scale: 2 }),
    insuranceAmountCurrency: integer('insurance_amount_currency').references(() => currencyMaster.id),
    insuranceReference: varchar('insurance_reference', { length: 100 }),

    // ── CRF & Declaration ──
    crfReference: varchar('crf_reference', { length: 100 }),
    crfReceivedDate: date('crf_received_date'),
    clearingBasisId: integer('clearing_basis_id').references(() => clearingBasisMaster.id),
    adDate: date('ad_date'),
    inspectionReports: varchar('inspection_reports', { length: 100 }),
    archiveReference: varchar('archive_reference', { length: 100 }),
    auditedDate: date('audited_date'),
    archivedDate: date('archived_date'),

    // ── Transport Documents ──
    roadManif: varchar('road_manif', { length: 100 }),
    airwayBill: varchar('airway_bill', { length: 100 }),
    container: varchar('container', { length: 100 }),
    entryPointId: integer('entry_point_id').references(() => transitPointMaster.id),
    wagon: varchar('wagon', { length: 100 }),
    airwayBillWeight: numeric('airway_bill_weight', { precision: 15, scale: 2 }),
    horse: varchar('horse', { length: 100 }),
    trailer1: varchar('trailer_1', { length: 100 }),
    trailer2: varchar('trailer_2', { length: 100 }),

    // ── Customs / DGDA ──
    dgdaInDate: date('dgda_in_date'),
    declarationReference: varchar('declaration_reference', { length: 100 }),
    seguesRcvRef: varchar('segues_rcv_ref', { length: 100 }),
    seguesPaymentDate: date('segues_payment_date'),
    customsManifestNumber: varchar('customs_manifest_number', { length: 100 }),
    customsManifestDate: date('customs_manifest_date'),
    customsClearanceCode: varchar('customs_clearance_code', { length: 100 }),
    dgdaOutDate: date('dgda_out_date'),
    documentStatus: integer('document_status').default(1).references(() => documentStatusMaster.id),
    declarationValidity: varchar('declaration_validity', { length: 50 }),
    t1Number: varchar('t1_number', { length: 100 }),
    t1Date: date('t1_date'),

    // ── Liquidation & Quittance ──
    liquidationReference: varchar('liquidation_reference', { length: 100 }),
    liquidationDate: date('liquidation_date'),
    liquidationPaidBy: varchar('liquidation_paid_by', { length: 100 }),
    liquidationAmount: numeric('liquidation_amount', { precision: 15, scale: 2 }),
    quittanceReference: varchar('quittance_reference', { length: 100 }),
    quittanceDate: date('quittance_date'),

    // ── Air Transport ──
    airportArrivalDate: date('airport_arrival_date'),
    dispatchFromAirport: date('dispatch_from_airport'),
    operatingCompany: varchar('operating_company', { length: 50 }),
    operatingDays: integer('operating_days'),
    operatingAmount: numeric('operating_amount', { precision: 10, scale: 2 }),

    // ── Routing & Warehouse ──
    arrivalDateZambia: date('arrival_date_zambia'),
    dispatchFromZambia: date('dispatch_from_zambia'),
    drcEntryDate: date('drc_entry_date'),
    borderWarehouseArrivalDate: date('border_warehouse_arrival_date'),
    dispatchFromBorder: date('dispatch_from_border'),
    kanyakaArrivalDate: date('kanyaka_arrival_date'),
    kanyakaDispatchDate: date('kanyaka_dispatch_date'),
    warehouseArrivalDate: date('warehouse_arrival_date'),
    warehouseDepartureDate: date('warehouse_departure_date'),
    dispatchDeliverDate: date('dispatch_deliver_date'),
    ibsCouponReference: varchar('ibs_coupon_reference', { length: 100 }),
    borderWarehouseId: integer('border_warehouse_id').references((): AnyPgColumn => transitPointMaster.id),
    entryCoupon: varchar('entry_coupon', { length: 100 }),
    bondedWarehouseId: integer('bonded_warehouse_id').references((): AnyPgColumn => transitPointMaster.id),
    truckStatusId: integer('truck_status_id').references(() => truckStatusMaster.id),

    // ── Status & Remarks ──
    // Nullable + no default: the §4.12 runtime creates a row from a single
    // accordion (usually 'basic'), which doesn't carry clearing_status. A
    // NOT NULL DEFAULT 1 here forced a bogus FK to clearing_status_master_t id=1
    // on create. Presence is enforced via the field's `required` flag on the
    // Status accordion instead (see 0062).
    clearingStatus: integer('clearing_status').references(() => clearingStatusMaster.id),
    invExportDisabled: boolean('inv_export_disabled').notNull().default(false),
    invExportDisabledRemark: varchar('inv_export_disabled_remark', { length: 500 }),
    // A dated remarks log — many entries, each with its own date and text.
    // Migration 0059 converted this from text to jsonb, which is what the column
    // was always documented to hold. Any free text already stored became the
    // first entry rather than being discarded.
    remarks: jsonb('remarks').$type<RemarkLine[]>().default([]),

    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references((): AnyPgColumn => usersT.id),
    updatedBy: integer('updated_by').references((): AnyPgColumn => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // Partial unique on mca_ref (allow blank/in-progress rows; enforce real refs).
    mcaRefUq: uniqueIndex('uq_imports_t_mca_ref')
      .on(t.mcaRef)
      .where(sql`${t.mcaRef} IS NOT NULL AND ${t.mcaRef} <> ''`),
    clientIdx: index('idx_imports_t_client').on(t.clientId),
    licenseIdx: index('idx_imports_t_license').on(t.licenseId),
    clearingStatusIdx: index('idx_imports_t_clearing_status').on(t.clearingStatus),
    preAlertIdx: index('idx_imports_t_pre_alert_date').on(t.preAlertDate),
    displayIdx: index('idx_imports_t_display').on(t.display),
  }),
);

export type ImportRow = typeof importT.$inferSelect;
export type ImportInsert = typeof importT.$inferInsert;
