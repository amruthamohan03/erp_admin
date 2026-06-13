// Reusable export-tracking read queries (§7.4). getExportDetail() resolves the
// FKs that matter for a human-readable view to their master names; getExportRows()
// returns the same projection for many rows (used by the Excel exports). Both share
// one column projection + join set so the View popup, the single export, and the
// grouped Excel exports never drift.
import { eq, and, desc, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import {
  exports,
  clients,
  licenses,
  kindMaster,
  typeOfGoodsMaster,
  transportModeMaster,
  currencyMaster,
  regimeMaster,
  clearanceMaster,
  feetContainerMaster,
  transitPointMaster,
  clearingStatusMaster,
  documentStatusMaster,
  truckStatusMaster,
} from '@/db/schema';

// Two transit-point joins (loading site + exit point) need distinct aliases.
const loadingSite = alias(transitPointMaster, 'loading_site');
const exitPoint = alias(transitPointMaster, 'exit_point');

// One projection shared by every export read. Snake_case keys are the public shape.
const detailColumns = {
  id: exports.id,
  mca_ref: exports.mcaRef,
  client_name: clients.shortName,
  license_number: licenses.licenseNumber,
  kind_name: kindMaster.kindName,
  type_of_goods: typeOfGoodsMaster.goodsType,
  transport_mode_name: transportModeMaster.transportModeName,
  currency: currencyMaster.currencyShortName,
  buyer: exports.buyer,
  regime_name: regimeMaster.regimeName,
  clearance_name: clearanceMaster.clearanceName,
  invoice: exports.invoice,
  po_ref: exports.poRef,
  bp_no: exports.bpNo,
  weight: exports.weight,
  fob: exports.fob,
  number_of_bags: exports.numberOfBags,
  lot_number: exports.lotNumber,
  horse: exports.horse,
  trailer_1: exports.trailer1,
  trailer_2: exports.trailer2,
  feet_container_size: feetContainerMaster.feetContainerSize,
  wagon_ref: exports.wagonRef,
  container: exports.container,
  transporter: exports.transporter,
  loading_site: loadingSite.transitPointName,
  destination: exports.destination,
  exit_point: exitPoint.transitPointName,
  dgda_seal_no: exports.dgdaSealNo,
  number_of_seals: exports.numberOfSeals,
  ceec_amount: exports.ceecAmount,
  cgea_amount: exports.cgeaAmount,
  occ_amount: exports.occAmount,
  lmc_amount: exports.lmcAmount,
  ogefrem_amount: exports.ogefremAmount,
  loading_date: exports.loadingDate,
  pv_date: exports.pvDate,
  bp_date: exports.bpDate,
  demande_attestation_date: exports.demandeAttestationDate,
  assay_date: exports.assayDate,
  archive_reference: exports.archiveReference,
  ceec_in_date: exports.ceecInDate,
  ceec_out_date: exports.ceecOutDate,
  min_div_in_date: exports.minDivInDate,
  min_div_out_date: exports.minDivOutDate,
  cgea_doc_ref: exports.cgeaDocRef,
  segues_rcv_ref: exports.seguesRcvRef,
  segues_payment_date: exports.seguesPaymentDate,
  document_status_name: documentStatusMaster.documentStatus,
  customs_clearing_code: exports.customsClearingCode,
  dgda_in_date: exports.dgdaInDate,
  declaration_reference: exports.declarationReference,
  liquidation_reference: exports.liquidationReference,
  liquidation_date: exports.liquidationDate,
  liquidation_paid_by: exports.liquidationPaidBy,
  liquidation_amount: exports.liquidationAmount,
  quittance_reference: exports.quittanceReference,
  quittance_date: exports.quittanceDate,
  dgda_out_date: exports.dgdaOutDate,
  gov_docs_in_date: exports.govDocsInDate,
  gov_docs_out_date: exports.govDocsOutDate,
  dispatch_deliver_date: exports.dispatchDeliverDate,
  kanyaka_arrival_date: exports.kanyakaArrivalDate,
  kanyaka_departure_date: exports.kanyakaDepartureDate,
  border_arrival_date: exports.borderArrivalDate,
  exit_drc_date: exports.exitDrcDate,
  end_of_formalities_date: exports.endOfFormalitiesDate,
  truck_status_name: truckStatusMaster.truckStatus,
  lmc_id: exports.lmcId,
  ogefrem_inv_ref: exports.ogefremInvRef,
  loading_to_dispatch_date: exports.loadingToDispatchDate,
  lmc_date: exports.lmcDate,
  ogefrem_date: exports.ogefremDate,
  audited_date: exports.auditedDate,
  archived_date: exports.archivedDate,
  clearing_status_name: clearingStatusMaster.clearingStatus,
  remarks: exports.remarks,
  created_at: exports.createdAt,
  updated_at: exports.updatedAt,
} as const;

function detailQuery() {
  return db
    .select(detailColumns)
    .from(exports)
    .leftJoin(clients, eq(clients.id, exports.clientId))
    .leftJoin(licenses, eq(licenses.id, exports.licenseId))
    .leftJoin(kindMaster, eq(kindMaster.id, exports.kind))
    .leftJoin(typeOfGoodsMaster, eq(typeOfGoodsMaster.id, exports.typeOfGoods))
    .leftJoin(transportModeMaster, eq(transportModeMaster.id, exports.transportMode))
    .leftJoin(currencyMaster, eq(currencyMaster.id, exports.currency))
    .leftJoin(regimeMaster, eq(regimeMaster.id, exports.regime))
    .leftJoin(clearanceMaster, eq(clearanceMaster.id, exports.typesOfClearance))
    .leftJoin(feetContainerMaster, eq(feetContainerMaster.id, exports.feetContainer))
    .leftJoin(loadingSite, eq(loadingSite.id, exports.siteOfLoadingId))
    .leftJoin(exitPoint, eq(exitPoint.id, exports.exitPointId))
    .leftJoin(clearingStatusMaster, eq(clearingStatusMaster.id, exports.clearingStatus))
    .leftJoin(documentStatusMaster, eq(documentStatusMaster.id, exports.documentStatus))
    .leftJoin(truckStatusMaster, eq(truckStatusMaster.id, exports.truckStatus));
}

export async function getExportDetail(id: number) {
  const [row] = await detailQuery().where(eq(exports.id, id)).limit(1);
  return row ?? null;
}

/** Many rows (rich projection) for the Excel exports. `conditions` are AND-ed. */
export async function getExportRows(conditions: SQL[]) {
  return detailQuery().where(and(...conditions)).orderBy(desc(exports.id));
}

export type ExportDetail = NonNullable<Awaited<ReturnType<typeof getExportDetail>>>;
export type ExportRichRow = Awaited<ReturnType<typeof getExportRows>>[number];
