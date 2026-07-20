import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  date,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
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
import { hscodeMaster } from './hscodeMaster';
import { incotermMaster } from './incotermMaster';
import { filesT } from './files';

// Import-tracking transactional entity (§2 step 3 — customs imports
// lifecycle). One row per consignment moving through customs clearance,
// from pre-alert to dispatch. ~55 columns spanning seven logical
// sections (Basic, Financial, CRF, Transport, Customs, Liquidation,
// Routing). Adapted from main-branch `imports_t`.
//
// Adaptations from main:
//   * licenseId points at this branch's case-runtime `license_t` (not
//     main's flat `licenses_t` which doesn't exist here). Our license
//     entity is richer — has state + workflow — so the FK gives stronger
//     integrity (a license must exist and be tracked through approval
//     before being referenced on an import).
//   * clientId points at `client_master_t` (our renamed `clients`).
//   * FK columns renamed with the `_id` suffix everywhere for
//     consistency with the rest of the branch (license_t uses
//     `license_type_id`, etc.). Main inherited the legacy MySQL naming
//     where FK columns were just `kind`, `currency`, etc.
//   * Audit FK references gain ON DELETE SET NULL (branch convention).
//
// Nullable business columns (client_id, license_id, mca_ref, etc.) —
// kept nullable so partial-create flows work. Presence is enforced in
// the API layer / form Zod schemas, not at the DB.
//
// `state` is the workflow state when this lands behind a case-runtime
// template (deferred — UI scope decision comes in the next slice).

export const importT = pgTable(
  'imports_t',
  {
    id: serial('id').primaryKey(),

    // ── Basic ──
    clientId: integer('client_id').references(() => clientMaster.id, {
      onDelete: 'restrict',
    }),
    licenseId: integer('license_id').references(() => licenseT.id, {
      onDelete: 'restrict',
    }),
    partialId: integer('partial_id').references(() => partialMaster.id, {
      onDelete: 'set null',
    }),
    kindId: integer('kind_id').references(() => kindMaster.id, {
      onDelete: 'set null',
    }),
    typeOfGoodsId: integer('type_of_goods_id').references(
      () => typeOfGoodsMaster.id,
      { onDelete: 'set null' },
    ),
    transportModeId: integer('transport_mode_id').references(
      () => transportModeMaster.id,
      { onDelete: 'set null' },
    ),
    mcaRef: varchar('mca_ref', { length: 100 }),
    currencyId: integer('currency_id').references(() => currencyMaster.id, {
      onDelete: 'set null',
    }),
    licenseInvoiceNumber: varchar('license_invoice_number', { length: 100 }),
    supplier: varchar('supplier', { length: 255 }),
    regimeId: integer('regime_id').references(() => regimeMaster.id, {
      onDelete: 'set null',
    }),
    typesOfClearanceId: integer('types_of_clearance_id').references(
      () => clearanceMaster.id,
      { onDelete: 'set null' },
    ),
    declarationOfficeId: integer('declaration_office_id').references(
      () => subOfficeMaster.id,
      { onDelete: 'set null' },
    ),
    preAlertDate: date('pre_alert_date'),
    invoice: varchar('invoice', { length: 100 }),
    commodityId: integer('commodity_id').references(() => commodityMaster.id, {
      onDelete: 'set null',
    }),
    hscodeId: integer('hscode_id').references(() => hscodeMaster.id, {
      onDelete: 'set null',
    }),
    incotermId: integer('incoterm_id').references(() => incotermMaster.id, {
      onDelete: 'set null',
    }),
    poRef: varchar('po_ref', { length: 100 }),

    // ── Financial ──
    fret: numeric('fret', { precision: 15, scale: 2 }),
    fretCurrencyId: integer('fret_currency_id').references(
      () => currencyMaster.id,
      { onDelete: 'set null' },
    ),
    otherCharges: numeric('other_charges', { precision: 15, scale: 2 }),
    otherChargesCurrencyId: integer('other_charges_currency_id').references(
      () => currencyMaster.id,
      { onDelete: 'set null' },
    ),
    weight: numeric('weight', { precision: 15, scale: 2 }),
    remWeight: numeric('rem_weight', { precision: 15, scale: 2 }),
    m3: numeric('m3', { precision: 10, scale: 2 }),
    cessionDate: date('cession_date'),
    fob: numeric('fob', { precision: 15, scale: 2 }),
    rFob: numeric('r_fob', { precision: 15, scale: 2 }),
    rFobCurrencyId: integer('r_fob_currency_id').references(
      () => currencyMaster.id,
      { onDelete: 'set null' },
    ),
    fobCurrencyId: integer('fob_currency_id').references(
      () => currencyMaster.id,
      { onDelete: 'set null' },
    ),
    insuranceDate: date('insurance_date'),
    insuranceAmount: numeric('insurance_amount', { precision: 15, scale: 2 }),
    insuranceAmountCurrencyId: integer('insurance_amount_currency_id').references(
      () => currencyMaster.id,
      { onDelete: 'set null' },
    ),
    insuranceReference: varchar('insurance_reference', { length: 100 }),

    // ── CRF & Declaration ──
    crfReference: varchar('crf_reference', { length: 100 }),
    crfReceivedDate: date('crf_received_date'),
    clearingBasedOn: varchar('clearing_based_on', { length: 50 }),
    adDate: date('ad_date'),
    // Legacy varchar `inspection_reports` kept for back-compat with
    // rows that stored a filename / shared drive path. New uploads
    // go through the FK column below (files_t). Future cleanup
    // migration can drop the varchar once every consumer switches
    // to reading inspection_reports_file_id.
    inspectionReports: varchar('inspection_reports', { length: 100 }),
    inspectionReportsFileId: integer('inspection_reports_file_id').references(
      () => filesT.id,
      { onDelete: 'set null' },
    ),
    archiveReference: varchar('archive_reference', { length: 100 }),
    auditedDate: date('audited_date'),
    archivedDate: date('archived_date'),

    // ── Transport Documents ──
    roadManif: varchar('road_manif', { length: 100 }),
    airwayBill: varchar('airway_bill', { length: 100 }),
    container: varchar('container', { length: 100 }),
    entryPointId: integer('entry_point_id').references(
      () => transitPointMaster.id,
      { onDelete: 'set null' },
    ),
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
    documentStatusId: integer('document_status_id').references(
      () => documentStatusMaster.id,
      { onDelete: 'set null' },
    ),
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
    borderWarehouseId: integer('border_warehouse_id').references(
      () => transitPointMaster.id,
      { onDelete: 'set null' },
    ),
    entryCoupon: varchar('entry_coupon', { length: 100 }),
    bondedWarehouseId: integer('bonded_warehouse_id').references(
      () => transitPointMaster.id,
      { onDelete: 'set null' },
    ),
    truckStatus: varchar('truck_status', { length: 100 }),

    // ── Status & Remarks ──
    clearingStatusId: integer('clearing_status_id').references(
      () => clearingStatusMaster.id,
      { onDelete: 'set null' },
    ),
    invExportDisabled: boolean('inv_export_disabled').notNull().default(false),
    invExportDisabledRemark: varchar('inv_export_disabled_remark', {
      length: 500,
    }),
    // JSON-shaped text — the array of remark events. Kept as text so
    // partial UI writes don't have to satisfy a strict shape; the API
    // layer parses/validates with Zod.
    remarks: text('remarks'),

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
    // mca_ref is the customs-side reference number. Unique among rows
    // where it's actually populated — partial-create flows leave it
    // blank until the operator gets to the CRF accordion.
    mcaRefUq: uniqueIndex('uq_imports_t_mca_ref')
      .on(t.mcaRef)
      .where(sql`${t.mcaRef} IS NOT NULL AND ${t.mcaRef} <> ''`),
    clientIdx: index('idx_imports_t_client').on(t.clientId),
    licenseIdx: index('idx_imports_t_license').on(t.licenseId),
    clearingStatusIdx: index('idx_imports_t_clearing_status').on(
      t.clearingStatusId,
    ),
    preAlertIdx: index('idx_imports_t_pre_alert_date').on(t.preAlertDate),
    displayIdx: index('idx_imports_t_display').on(t.display),
  }),
);

export const importRelations = relations(importT, ({ one }) => ({
  client: one(clientMaster, {
    fields: [importT.clientId],
    references: [clientMaster.id],
  }),
  license: one(licenseT, {
    fields: [importT.licenseId],
    references: [licenseT.id],
  }),
  partial: one(partialMaster, {
    fields: [importT.partialId],
    references: [partialMaster.id],
  }),
  kind: one(kindMaster, {
    fields: [importT.kindId],
    references: [kindMaster.id],
  }),
  typeOfGoods: one(typeOfGoodsMaster, {
    fields: [importT.typeOfGoodsId],
    references: [typeOfGoodsMaster.id],
  }),
  transportMode: one(transportModeMaster, {
    fields: [importT.transportModeId],
    references: [transportModeMaster.id],
  }),
  currency: one(currencyMaster, {
    fields: [importT.currencyId],
    references: [currencyMaster.id],
  }),
  regime: one(regimeMaster, {
    fields: [importT.regimeId],
    references: [regimeMaster.id],
  }),
  clearance: one(clearanceMaster, {
    fields: [importT.typesOfClearanceId],
    references: [clearanceMaster.id],
  }),
  declarationOffice: one(subOfficeMaster, {
    fields: [importT.declarationOfficeId],
    references: [subOfficeMaster.id],
  }),
  commodity: one(commodityMaster, {
    fields: [importT.commodityId],
    references: [commodityMaster.id],
  }),
  hscode: one(hscodeMaster, {
    fields: [importT.hscodeId],
    references: [hscodeMaster.id],
  }),
  incoterm: one(incotermMaster, {
    fields: [importT.incotermId],
    references: [incotermMaster.id],
  }),
  documentStatus: one(documentStatusMaster, {
    fields: [importT.documentStatusId],
    references: [documentStatusMaster.id],
  }),
  clearingStatus: one(clearingStatusMaster, {
    fields: [importT.clearingStatusId],
    references: [clearingStatusMaster.id],
  }),
}));

export type ImportRow = typeof importT.$inferSelect;
export type ImportInsert = typeof importT.$inferInsert;
