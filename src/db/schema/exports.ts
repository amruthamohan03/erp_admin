import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  date,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { usersT } from './users';
import { clientMaster } from './clients';
import { licenseT } from './license';
import { kindMaster } from './kindMaster';
import { typeOfGoodsMaster } from './typeOfGoodsMaster';
import { transportModeMaster } from './transportModeMaster';
import { currencyMaster } from './currencyMaster';
import { regimeMaster } from './regimeMaster';
import { clearanceMaster } from './clearanceMaster';
import { transitPointMaster } from './transitPointMaster';
import { feetContainerMaster } from './feetContainerMaster';
import { documentStatusMaster } from './documentStatusMaster';
import { clearingStatusMaster } from './clearingStatusMaster';
import { truckStatusMaster } from './truckStatusMaster';
import { hscodeMaster } from './hscodeMaster';
import { incotermMaster } from './incotermMaster';

// Export-tracking transactional entity (§2 step 3 — customs exports
// lifecycle). One row per outbound consignment, from documentation
// through loading, declaration, dispatch, and arrival at the border /
// destination. ~70 columns split into six logical sections
// (Documentation, Weight & Financial, Transport, Seals, Charge
// Amounts, Dates / Declaration / Logistics / Status). Adapted from
// main-branch `exports_t`.
//
// Adaptations from main — same posture as imports_t:
//   * licenseId points at this branch's case-runtime `license_t`
//     (main's flat `licenses_t` doesn't exist here).
//   * clientId points at `client_master_t`.
//   * FK columns gain consistent _id suffix (kind_id, regime_id,
//     truck_status_id, etc.) instead of bare names.
//   * Audit FK references gain ON DELETE SET NULL (branch convention).
//
// `weight` keeps 3-decimal precision (numeric 15,3) — exports are
// weighed in MT down to the kilo; everything else stays 2-decimal.
//
// Charge amount columns (ceec/cgea/occ/lmc/ogefrem) are stored
// directly rather than derived via tax_rule_master_t — exports use
// fixed-fee schedules that the operator enters per consignment. If a
// future export charge becomes formula-driven, route it through the
// rule engine (§4.2) rather than adding more `*_amount` columns.

export const exportT = pgTable(
  'exports_t',
  {
    id: serial('id').primaryKey(),

    // ── Documentation ──
    clientId: integer('client_id').references(() => clientMaster.id, {
      onDelete: 'restrict',
    }),
    licenseId: integer('license_id').references(() => licenseT.id, {
      onDelete: 'restrict',
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
    buyer: varchar('buyer', { length: 255 }),
    regimeId: integer('regime_id').references(() => regimeMaster.id, {
      onDelete: 'set null',
    }),
    typesOfClearanceId: integer('types_of_clearance_id').references(
      () => clearanceMaster.id,
      { onDelete: 'set null' },
    ),
    invoice: varchar('invoice', { length: 100 }),
    poRef: varchar('po_ref', { length: 100 }),
    bpNo: varchar('bp_no', { length: 100 }),
    hscodeId: integer('hscode_id').references(() => hscodeMaster.id, {
      onDelete: 'set null',
    }),
    incotermId: integer('incoterm_id').references(() => incotermMaster.id, {
      onDelete: 'set null',
    }),

    // ── Weight & Financial ──
    weight: numeric('weight', { precision: 10, scale: 3 }),
    fob: numeric('fob', { precision: 15, scale: 2 }),
    numberOfBags: integer('number_of_bags'),
    lotNumber: varchar('lot_number', { length: 100 }),

    // ── Transport ──
    horse: varchar('horse', { length: 50 }),
    trailer1: varchar('trailer_1', { length: 50 }),
    trailer2: varchar('trailer_2', { length: 50 }),
    feetContainerId: integer('feet_container_id').references(
      () => feetContainerMaster.id,
      { onDelete: 'set null' },
    ),
    wagonRef: varchar('wagon_ref', { length: 50 }),
    container: varchar('container', { length: 50 }),
    transporter: varchar('transporter', { length: 255 }),
    siteOfLoadingId: integer('site_of_loading_id').references(
      () => transitPointMaster.id,
      { onDelete: 'set null' },
    ),
    destination: varchar('destination', { length: 255 }),
    exitPointId: integer('exit_point_id').references(
      () => transitPointMaster.id,
      { onDelete: 'set null' },
    ),

    // ── Seals ──
    dgdaSealNo: varchar('dgda_seal_no', { length: 255 }),
    numberOfSeals: integer('number_of_seals'),

    // ── Charge Amounts ──
    ceecAmount: numeric('ceec_amount', { precision: 10, scale: 2 }),
    cgeaAmount: numeric('cgea_amount', { precision: 10, scale: 2 }),
    occAmount: numeric('occ_amount', { precision: 10, scale: 2 }),
    lmcAmount: numeric('lmc_amount', { precision: 10, scale: 2 }),
    ogefremAmount: numeric('ogefrem_amount', { precision: 10, scale: 2 }),

    // ── Dates / Loading & Documentation ──
    loadingDate: date('loading_date'),
    pvDate: date('pv_date'),
    bpDate: date('bp_date'),
    demandeAttestationDate: date('demande_attestation_date'),
    assayDate: date('assay_date'),
    archiveReference: varchar('archive_reference', { length: 255 }),

    // ── Declaration ──
    ceecInDate: date('ceec_in_date'),
    ceecOutDate: date('ceec_out_date'),
    minDivInDate: date('min_div_in_date'),
    minDivOutDate: date('min_div_out_date'),
    cgeaDocRef: varchar('cgea_doc_ref', { length: 100 }),
    seguesRcvRef: varchar('segues_rcv_ref', { length: 100 }),
    seguesPaymentDate: date('segues_payment_date'),
    documentStatusId: integer('document_status_id').references(
      () => documentStatusMaster.id,
      { onDelete: 'set null' },
    ),
    customsClearingCode: varchar('customs_clearing_code', { length: 100 }),
    dgdaInDate: date('dgda_in_date'),
    declarationReference: varchar('declaration_reference', { length: 100 }),
    liquidationReference: varchar('liquidation_reference', { length: 100 }),
    liquidationDate: date('liquidation_date'),
    liquidationPaidBy: varchar('liquidation_paid_by', { length: 100 }),
    liquidationAmount: numeric('liquidation_amount', { precision: 15, scale: 2 }),
    quittanceReference: varchar('quittance_reference', { length: 100 }),
    quittanceDate: date('quittance_date'),
    dgdaOutDate: date('dgda_out_date'),
    govDocsInDate: date('gov_docs_in_date'),
    govDocsOutDate: date('gov_docs_out_date'),

    // ── Logistics ──
    dispatchDeliverDate: date('dispatch_deliver_date'),
    kanyakaArrivalDate: date('kanyaka_arrival_date'),
    kanyakaDepartureDate: date('kanyaka_departure_date'),
    borderArrivalDate: date('border_arrival_date'),
    exitDrcDate: date('exit_drc_date'),
    endOfFormalitiesDate: date('end_of_formalities_date'),
    truckStatusId: integer('truck_status_id').references(
      () => truckStatusMaster.id,
      { onDelete: 'set null' },
    ),
    lmcId: varchar('lmc_id', { length: 100 }),
    ogefremInvRef: varchar('ogefrem_inv_ref', { length: 100 }),
    loadingToDispatchDate: date('loading_to_dispatch_date'),
    lmcDate: date('lmc_date'),
    ogefremDate: date('ogefrem_date'),
    auditedDate: date('audited_date'),
    archivedDate: date('archived_date'),

    // ── Status & Remarks ──
    clearingStatusId: integer('clearing_status_id').references(
      () => clearingStatusMaster.id,
      { onDelete: 'set null' },
    ),
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
    mcaRefUq: uniqueIndex('uq_exports_t_mca_ref')
      .on(t.mcaRef)
      .where(sql`${t.mcaRef} IS NOT NULL AND ${t.mcaRef} <> ''`),
    clientIdx: index('idx_exports_t_client').on(t.clientId),
    licenseIdx: index('idx_exports_t_license').on(t.licenseId),
    clearingStatusIdx: index('idx_exports_t_clearing_status').on(
      t.clearingStatusId,
    ),
    loadingDateIdx: index('idx_exports_t_loading_date').on(t.loadingDate),
    displayIdx: index('idx_exports_t_display').on(t.display),
  }),
);

export const exportRelations = relations(exportT, ({ one }) => ({
  client: one(clientMaster, {
    fields: [exportT.clientId],
    references: [clientMaster.id],
  }),
  license: one(licenseT, {
    fields: [exportT.licenseId],
    references: [licenseT.id],
  }),
  kind: one(kindMaster, {
    fields: [exportT.kindId],
    references: [kindMaster.id],
  }),
  typeOfGoods: one(typeOfGoodsMaster, {
    fields: [exportT.typeOfGoodsId],
    references: [typeOfGoodsMaster.id],
  }),
  transportMode: one(transportModeMaster, {
    fields: [exportT.transportModeId],
    references: [transportModeMaster.id],
  }),
  currency: one(currencyMaster, {
    fields: [exportT.currencyId],
    references: [currencyMaster.id],
  }),
  regime: one(regimeMaster, {
    fields: [exportT.regimeId],
    references: [regimeMaster.id],
  }),
  clearance: one(clearanceMaster, {
    fields: [exportT.typesOfClearanceId],
    references: [clearanceMaster.id],
  }),
  feetContainer: one(feetContainerMaster, {
    fields: [exportT.feetContainerId],
    references: [feetContainerMaster.id],
  }),
  documentStatus: one(documentStatusMaster, {
    fields: [exportT.documentStatusId],
    references: [documentStatusMaster.id],
  }),
  truckStatus: one(truckStatusMaster, {
    fields: [exportT.truckStatusId],
    references: [truckStatusMaster.id],
  }),
  clearingStatus: one(clearingStatusMaster, {
    fields: [exportT.clearingStatusId],
    references: [clearingStatusMaster.id],
  }),
  hscode: one(hscodeMaster, {
    fields: [exportT.hscodeId],
    references: [hscodeMaster.id],
  }),
  incoterm: one(incotermMaster, {
    fields: [exportT.incotermId],
    references: [incotermMaster.id],
  }),
}));

export type ExportRow = typeof exportT.$inferSelect;
export type ExportInsert = typeof exportT.$inferInsert;
