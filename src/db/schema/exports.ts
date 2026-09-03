// Export Tracking — the export-tracking stage of the consignment lifecycle (§2).
// Mirrors the legacy `exports_t` MySQL table (ExportController::prepareExportData).
//
// Deviations from source (deliberate, same posture as imports.ts):
//   * `subscriber_id` (FK to clients) is renamed `client_id`.
//   * `id` is `serial` (int) not `bigint`.
//   * Business NOT NULL columns (client_id, license_id, mca_ref, weight, …) are
//     nullable here — the §4.12 runtime INSERTs a new row from a single accordion,
//     so cross-accordion NOT NULLs can't be met on create. Presence is enforced
//     per-field via `required` in master_page_accordion_field_t (see the page seed).
//   * `weight` keeps 3-decimal precision (numeric 15,3) — exports are weighed in MT
//     to the kilo; fob/amounts stay 2-decimal.
//
// TODO(storage): seal/file fields stay varchar; per §4.11 true uploads move to S3
// + the files table later (same as imports).
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  jsonb,
  date,
  numeric,
  timestamp,
  type AnyPgColumn,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';
import { clientMaster } from './clients';
// The dated-remark shape is shared with Import — one log entry means the same
// thing on both sides, so it is defined once (§4.10).
import type { RemarkLine } from './imports';
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

export const exportT = pgTable(
  'exports_t',
  {
    id: serial('id').primaryKey(),

    // ── Documentation ──
    clientId: integer('client_id').references((): AnyPgColumn => clientMaster.id),
    licenseId: integer('license_id').references((): AnyPgColumn => licenseT.id),
    kind: integer('kind').references(() => kindMaster.id),
    typeOfGoods: integer('type_of_goods').references(() => typeOfGoodsMaster.id),
    transportMode: integer('transport_mode').references(() => transportModeMaster.id),
    mcaRef: varchar('mca_ref', { length: 100 }),
    currency: integer('currency').references(() => currencyMaster.id),
    buyer: varchar('buyer', { length: 255 }),
    regime: integer('regime').references(() => regimeMaster.id),
    typesOfClearance: integer('types_of_clearance').references(() => clearanceMaster.id),
    invoice: varchar('invoice', { length: 100 }),
    poRef: varchar('po_ref', { length: 100 }),
    // Source stores bp_no as varchar(100) (may carry formatting / leading zeros).
    bpNo: varchar('bp_no', { length: 100 }),

    // ── Weight / Financial ──
    weight: numeric('weight', { precision: 10, scale: 3 }),
    fob: numeric('fob', { precision: 15, scale: 2 }),
    numberOfBags: integer('number_of_bags'),
    lotNumber: varchar('lot_number', { length: 100 }),

    // ── Transport ──
    horse: varchar('horse', { length: 50 }),
    trailer1: varchar('trailer_1', { length: 50 }),
    trailer2: varchar('trailer_2', { length: 50 }),
    feetContainer: integer('feet_container').references(() => feetContainerMaster.id),
    wagonRef: varchar('wagon_ref', { length: 50 }),
    container: varchar('container', { length: 50 }),
    transporter: varchar('transporter', { length: 255 }),
    siteOfLoadingId: integer('site_of_loading_id').references((): AnyPgColumn => transitPointMaster.id),
    destination: varchar('destination', { length: 255 }),
    exitPointId: integer('exit_point_id').references((): AnyPgColumn => transitPointMaster.id),

    // ── Seals ──
    dgdaSealNo: varchar('dgda_seal_no', { length: 255 }),
    numberOfSeals: integer('number_of_seals'),

    // ── Charge amounts (config-driven derive, see export charge seed) ──
    ceecAmount: numeric('ceec_amount', { precision: 10, scale: 2 }),
    cgeaAmount: numeric('cgea_amount', { precision: 10, scale: 2 }),
    occAmount: numeric('occ_amount', { precision: 10, scale: 2 }),
    lmcAmount: numeric('lmc_amount', { precision: 10, scale: 2 }),
    ogefremAmount: numeric('ogefrem_amount', { precision: 10, scale: 2 }),

    // ── Dates: loading / documentation ──
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
    documentStatus: integer('document_status').references(() => documentStatusMaster.id),
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
    truckStatus: integer('truck_status').references(() => truckStatusMaster.id),
    lmcId: varchar('lmc_id', { length: 100 }),
    ogefremInvRef: varchar('ogefrem_inv_ref', { length: 100 }),
    loadingToDispatchDate: date('loading_to_dispatch_date'),
    lmcDate: date('lmc_date'),
    ogefremDate: date('ogefrem_date'),
    auditedDate: date('audited_date'),
    archivedDate: date('archived_date'),

    // ── Status & Remarks ──
    clearingStatus: integer('clearing_status').references(() => clearingStatusMaster.id),
    // A dated remarks log — many entries, each with its own date and text.
    // Migration 0061 converted this from text to jsonb, matching what Import's
    // column became in 0059. Free text already stored became the first entry
    // rather than being discarded.
    remarks: jsonb('remarks').$type<RemarkLine[]>().default([]),

    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references((): AnyPgColumn => usersT.id),
    updatedBy: integer('updated_by').references((): AnyPgColumn => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // Partial unique on mca_ref (allow blank/in-progress rows; enforce real refs).
    mcaRefUq: uniqueIndex('uq_exports_t_mca_ref')
      .on(t.mcaRef)
      .where(sql`${t.mcaRef} IS NOT NULL AND ${t.mcaRef} <> ''`),
    clientIdx: index('idx_exports_t_client').on(t.clientId),
    licenseIdx: index('idx_exports_t_license').on(t.licenseId),
    clearingStatusIdx: index('idx_exports_t_clearing_status').on(t.clearingStatus),
    loadingDateIdx: index('idx_exports_t_loading_date').on(t.loadingDate),
    displayIdx: index('idx_exports_t_display').on(t.display),
  }),
);

export type ExportRow = typeof exportT.$inferSelect;
export type ExportInsert = typeof exportT.$inferInsert;
