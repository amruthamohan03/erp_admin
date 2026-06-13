// Reusable import-tracking read queries (§7.4). getImportDetail() resolves the
// FKs that matter for a human-readable view to their master names and is shared
// by the JSON detail endpoint (the View popup) and the single CSV export, so the
// two never drift. It returns a curated subset of imports_t (~35 fields) — the
// list columns plus the milestone dates/references that back the stat cards —
// not all ~100 columns of the source table.
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  imports,
  clients,
  licenses,
  kindMaster,
  typeOfGoodsMaster,
  transportModeMaster,
  currencyMaster,
  regimeMaster,
  clearanceMaster,
  commodityMaster,
  transitPointMaster,
  clearingStatusMaster,
  documentStatusMaster,
} from '@/db/schema';

export async function getImportDetail(id: number) {
  const [row] = await db
    .select({
      id: imports.id,
      mca_ref: imports.mcaRef,
      client_name: clients.shortName,
      license_number: licenses.licenseNumber,
      kind_name: kindMaster.kindName,
      type_of_goods: typeOfGoodsMaster.goodsType,
      transport_mode_name: transportModeMaster.transportModeName,
      currency: currencyMaster.currencyShortName,
      regime_name: regimeMaster.regimeName,
      clearance_name: clearanceMaster.clearanceName,
      commodity_name: commodityMaster.commodityName,
      supplier: imports.supplier,
      po_ref: imports.poRef,
      invoice: imports.invoice,
      license_invoice_number: imports.licenseInvoiceNumber,
      pre_alert_date: imports.preAlertDate,
      fret: imports.fret,
      other_charges: imports.otherCharges,
      weight: imports.weight,
      m3: imports.m3,
      fob: imports.fob,
      insurance_date: imports.insuranceDate,
      insurance_amount: imports.insuranceAmount,
      insurance_reference: imports.insuranceReference,
      crf_reference: imports.crfReference,
      crf_received_date: imports.crfReceivedDate,
      ad_date: imports.adDate,
      audited_date: imports.auditedDate,
      archived_date: imports.archivedDate,
      entry_point_name: transitPointMaster.transitPointName,
      dgda_in_date: imports.dgdaInDate,
      declaration_reference: imports.declarationReference,
      customs_clearance_code: imports.customsClearanceCode,
      dgda_out_date: imports.dgdaOutDate,
      document_status_name: documentStatusMaster.documentStatus,
      liquidation_reference: imports.liquidationReference,
      liquidation_date: imports.liquidationDate,
      liquidation_amount: imports.liquidationAmount,
      quittance_reference: imports.quittanceReference,
      quittance_date: imports.quittanceDate,
      dispatch_deliver_date: imports.dispatchDeliverDate,
      clearing_status_name: clearingStatusMaster.clearingStatus,
      created_at: imports.createdAt,
      updated_at: imports.updatedAt,
    })
    .from(imports)
    .leftJoin(clients, eq(clients.id, imports.clientId))
    .leftJoin(licenses, eq(licenses.id, imports.licenseId))
    .leftJoin(kindMaster, eq(kindMaster.id, imports.kind))
    .leftJoin(typeOfGoodsMaster, eq(typeOfGoodsMaster.id, imports.typeOfGoods))
    .leftJoin(transportModeMaster, eq(transportModeMaster.id, imports.transportMode))
    .leftJoin(currencyMaster, eq(currencyMaster.id, imports.currency))
    .leftJoin(regimeMaster, eq(regimeMaster.id, imports.regime))
    .leftJoin(clearanceMaster, eq(clearanceMaster.id, imports.typesOfClearance))
    .leftJoin(commodityMaster, eq(commodityMaster.id, imports.commodity))
    .leftJoin(transitPointMaster, eq(transitPointMaster.id, imports.entryPointId))
    .leftJoin(clearingStatusMaster, eq(clearingStatusMaster.id, imports.clearingStatus))
    .leftJoin(documentStatusMaster, eq(documentStatusMaster.id, imports.documentStatus))
    .where(eq(imports.id, id))
    .limit(1);

  return row ?? null;
}

export type ImportDetail = NonNullable<Awaited<ReturnType<typeof getImportDetail>>>;
