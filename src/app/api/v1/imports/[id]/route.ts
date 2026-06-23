import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  importT,
  clientMaster,
  licenseT,
  partialMaster,
  kindMaster,
  typeOfGoodsMaster,
  transportModeMaster,
  regimeMaster,
  clearanceMaster,
  subOfficeMaster,
  commodityMaster,
  transitPointMaster,
  documentStatusMaster,
  clearingStatusMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { importBodySchema } from '@/schemas/imports';
import { bodyToInsert } from '@/lib/imports/serialize';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/imports/{id}
// Single import row with every master FK resolved to its display name.
// The UI detail page renders the whole accordion layout from this one
// payload — no per-master roundtrips. Joins are LEFT so the row comes
// back even if some FKs are unset (which is the normal partial-create
// state).

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    // Two transit-point aliases: entry_point and border_warehouse both
    // FK to transit_point_master_t. Drizzle's leftJoin needs distinct
    // aliases so the joined columns don't collide in the SELECT shape.
    // We resolve border/bonded warehouse names with a follow-up query
    // rather than a third aliased join, to keep this query readable.
    const [header] = await db
      .select({
        id: importT.id,
        // Basic
        client_id: importT.clientId,
        client_name: clientMaster.name,
        license_id: importT.licenseId,
        license_no: licenseT.licenseNo,
        partial_id: importT.partialId,
        partial_name: partialMaster.partialName,
        kind_id: importT.kindId,
        kind_name: kindMaster.kindName,
        type_of_goods_id: importT.typeOfGoodsId,
        type_of_goods_name: typeOfGoodsMaster.goodsType,
        transport_mode_id: importT.transportModeId,
        transport_mode_name: transportModeMaster.transportModeName,
        mca_ref: importT.mcaRef,
        currency_id: importT.currencyId,
        license_invoice_number: importT.licenseInvoiceNumber,
        supplier: importT.supplier,
        regime_id: importT.regimeId,
        regime_name: regimeMaster.regimeName,
        types_of_clearance_id: importT.typesOfClearanceId,
        types_of_clearance_name: clearanceMaster.clearanceName,
        declaration_office_id: importT.declarationOfficeId,
        declaration_office_name: subOfficeMaster.subOfficeName,
        pre_alert_date: importT.preAlertDate,
        invoice: importT.invoice,
        commodity_id: importT.commodityId,
        commodity_name: commodityMaster.commodityName,
        po_ref: importT.poRef,
        // Financial
        fret: importT.fret,
        fret_currency_id: importT.fretCurrencyId,
        other_charges: importT.otherCharges,
        other_charges_currency_id: importT.otherChargesCurrencyId,
        weight: importT.weight,
        rem_weight: importT.remWeight,
        m3: importT.m3,
        cession_date: importT.cessionDate,
        fob: importT.fob,
        r_fob: importT.rFob,
        r_fob_currency_id: importT.rFobCurrencyId,
        fob_currency_id: importT.fobCurrencyId,
        insurance_date: importT.insuranceDate,
        insurance_amount: importT.insuranceAmount,
        insurance_amount_currency_id: importT.insuranceAmountCurrencyId,
        insurance_reference: importT.insuranceReference,
        // CRF
        crf_reference: importT.crfReference,
        crf_received_date: importT.crfReceivedDate,
        clearing_based_on: importT.clearingBasedOn,
        ad_date: importT.adDate,
        inspection_reports: importT.inspectionReports,
        archive_reference: importT.archiveReference,
        audited_date: importT.auditedDate,
        archived_date: importT.archivedDate,
        // Transport docs
        road_manif: importT.roadManif,
        airway_bill: importT.airwayBill,
        container: importT.container,
        entry_point_id: importT.entryPointId,
        entry_point_name: transitPointMaster.transitPointName,
        wagon: importT.wagon,
        airway_bill_weight: importT.airwayBillWeight,
        horse: importT.horse,
        trailer_1: importT.trailer1,
        trailer_2: importT.trailer2,
        // Customs / DGDA
        dgda_in_date: importT.dgdaInDate,
        declaration_reference: importT.declarationReference,
        segues_rcv_ref: importT.seguesRcvRef,
        segues_payment_date: importT.seguesPaymentDate,
        customs_manifest_number: importT.customsManifestNumber,
        customs_manifest_date: importT.customsManifestDate,
        customs_clearance_code: importT.customsClearanceCode,
        dgda_out_date: importT.dgdaOutDate,
        document_status_id: importT.documentStatusId,
        document_status_name: documentStatusMaster.documentStatus,
        declaration_validity: importT.declarationValidity,
        t1_number: importT.t1Number,
        t1_date: importT.t1Date,
        // Liquidation
        liquidation_reference: importT.liquidationReference,
        liquidation_date: importT.liquidationDate,
        liquidation_paid_by: importT.liquidationPaidBy,
        liquidation_amount: importT.liquidationAmount,
        quittance_reference: importT.quittanceReference,
        quittance_date: importT.quittanceDate,
        // Air
        airport_arrival_date: importT.airportArrivalDate,
        dispatch_from_airport: importT.dispatchFromAirport,
        operating_company: importT.operatingCompany,
        operating_days: importT.operatingDays,
        operating_amount: importT.operatingAmount,
        // Routing
        arrival_date_zambia: importT.arrivalDateZambia,
        dispatch_from_zambia: importT.dispatchFromZambia,
        drc_entry_date: importT.drcEntryDate,
        border_warehouse_arrival_date: importT.borderWarehouseArrivalDate,
        dispatch_from_border: importT.dispatchFromBorder,
        kanyaka_arrival_date: importT.kanyakaArrivalDate,
        kanyaka_dispatch_date: importT.kanyakaDispatchDate,
        warehouse_arrival_date: importT.warehouseArrivalDate,
        warehouse_departure_date: importT.warehouseDepartureDate,
        dispatch_deliver_date: importT.dispatchDeliverDate,
        ibs_coupon_reference: importT.ibsCouponReference,
        border_warehouse_id: importT.borderWarehouseId,
        entry_coupon: importT.entryCoupon,
        bonded_warehouse_id: importT.bondedWarehouseId,
        truck_status: importT.truckStatus,
        // Status & remarks
        clearing_status_id: importT.clearingStatusId,
        clearing_status_name: clearingStatusMaster.clearingStatus,
        inv_export_disabled: importT.invExportDisabled,
        inv_export_disabled_remark: importT.invExportDisabledRemark,
        remarks: importT.remarks,
        display: importT.display,
        created_at: importT.createdAt,
        updated_at: importT.updatedAt,
      })
      .from(importT)
      .leftJoin(clientMaster, eq(clientMaster.id, importT.clientId))
      .leftJoin(licenseT, eq(licenseT.id, importT.licenseId))
      .leftJoin(partialMaster, eq(partialMaster.id, importT.partialId))
      .leftJoin(kindMaster, eq(kindMaster.id, importT.kindId))
      .leftJoin(
        typeOfGoodsMaster,
        eq(typeOfGoodsMaster.id, importT.typeOfGoodsId),
      )
      .leftJoin(
        transportModeMaster,
        eq(transportModeMaster.id, importT.transportModeId),
      )
      .leftJoin(regimeMaster, eq(regimeMaster.id, importT.regimeId))
      .leftJoin(
        clearanceMaster,
        eq(clearanceMaster.id, importT.typesOfClearanceId),
      )
      .leftJoin(
        subOfficeMaster,
        eq(subOfficeMaster.id, importT.declarationOfficeId),
      )
      .leftJoin(commodityMaster, eq(commodityMaster.id, importT.commodityId))
      .leftJoin(
        transitPointMaster,
        eq(transitPointMaster.id, importT.entryPointId),
      )
      .leftJoin(
        documentStatusMaster,
        eq(documentStatusMaster.id, importT.documentStatusId),
      )
      .leftJoin(
        clearingStatusMaster,
        eq(clearingStatusMaster.id, importT.clearingStatusId),
      )
      .where(eq(importT.id, id))
      .limit(1);

    if (!header) throw new NotFoundError('Import not found');

    // Resolve the border/bonded warehouse names. Both FK to
    // transit_point_master_t but we can't double-join on the same alias
    // without distinct aliases — cheap second query keeps the main
    // SELECT readable.
    const tpIds = [header.border_warehouse_id, header.bonded_warehouse_id]
      .filter((v): v is number => v != null);
    let tpById: Map<number, string> = new Map();
    if (tpIds.length > 0) {
      const rows = await db
        .select({
          id: transitPointMaster.id,
          name: transitPointMaster.transitPointName,
        })
        .from(transitPointMaster)
        .where(sql`${transitPointMaster.id} IN (${sql.join(tpIds, sql`, `)})`);
      tpById = new Map(rows.map((r) => [r.id, r.name]));
    }

    return ok({
      ...header,
      border_warehouse_name: header.border_warehouse_id
        ? (tpById.get(header.border_warehouse_id) ?? null)
        : null,
      bonded_warehouse_name: header.bonded_warehouse_id
        ? (tpById.get(header.bonded_warehouse_id) ?? null)
        : null,
    });
  },
);

// PUT /api/v1/imports/{id}
// Replace-in-place update — every absent field becomes NULL. Matches
// the quotations PUT semantics. Partial-section updates would belong
// on a separate PATCH endpoint (deferred — wait until the UI shape
// settles).

export const PUT = withErrorHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const body = importBodySchema.parse(await req.json());

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(importT)
        .set({
          ...bodyToInsert(body),
          updatedBy: session.uid,
          updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
        })
        .where(eq(importT.id, id))
        .returning({ id: importT.id });
      if (!row) return null;

      await recordAudit(tx, {
        actorId: session.uid,
        action: 'update',
        entityType: 'import',
        entityId: String(id),
        after: body,
      });

      return row.id;
    });

    if (!updated) throw new NotFoundError('Import not found');
    return ok({ id: updated });
  },
);

// DELETE /api/v1/imports/{id}
// Soft-delete: flip display='N'. The partial unique index on mca_ref
// scopes to display='Y'-equivalent rows so the ref is freed up for
// reuse the moment a row is hidden.

export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const deleted = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(importT)
        .set({
          display: 'N',
          updatedBy: session.uid,
          updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
        })
        .where(eq(importT.id, id))
        .returning({ id: importT.id });
      if (!row) return null;

      await recordAudit(tx, {
        actorId: session.uid,
        action: 'delete',
        entityType: 'import',
        entityId: String(id),
      });

      return row.id;
    });

    if (!deleted) throw new NotFoundError('Import not found');
    return ok({ id: deleted });
  },
);
