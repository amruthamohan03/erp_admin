import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  exportT,
  clientMaster,
  licenseT,
  kindMaster,
  typeOfGoodsMaster,
  transportModeMaster,
  regimeMaster,
  clearanceMaster,
  feetContainerMaster,
  transitPointMaster,
  documentStatusMaster,
  clearingStatusMaster,
  truckStatusMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { exportBodySchema } from '@/schemas/exports';
import { bodyToInsert } from '@/lib/exports/serialize';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/exports/{id} — full read with all 12 master joins.
// site_of_loading and exit_point both FK to transit_point_master_t
// so the loading-site name comes through the main join; exit_point
// name is resolved with a small follow-up SELECT IN.

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [header] = await db
      .select({
        id: exportT.id,
        // Documentation
        client_id: exportT.clientId,
        client_name: clientMaster.name,
        license_id: exportT.licenseId,
        license_no: licenseT.licenseNo,
        kind_id: exportT.kindId,
        kind_name: kindMaster.kindName,
        type_of_goods_id: exportT.typeOfGoodsId,
        type_of_goods_name: typeOfGoodsMaster.goodsType,
        transport_mode_id: exportT.transportModeId,
        transport_mode_name: transportModeMaster.transportModeName,
        mca_ref: exportT.mcaRef,
        currency_id: exportT.currencyId,
        buyer: exportT.buyer,
        regime_id: exportT.regimeId,
        regime_name: regimeMaster.regimeName,
        types_of_clearance_id: exportT.typesOfClearanceId,
        types_of_clearance_name: clearanceMaster.clearanceName,
        invoice: exportT.invoice,
        po_ref: exportT.poRef,
        bp_no: exportT.bpNo,
        // Weight / financial
        weight: exportT.weight,
        fob: exportT.fob,
        number_of_bags: exportT.numberOfBags,
        lot_number: exportT.lotNumber,
        // Transport
        horse: exportT.horse,
        trailer_1: exportT.trailer1,
        trailer_2: exportT.trailer2,
        feet_container_id: exportT.feetContainerId,
        feet_container_size: feetContainerMaster.feetContainerSize,
        wagon_ref: exportT.wagonRef,
        container: exportT.container,
        transporter: exportT.transporter,
        site_of_loading_id: exportT.siteOfLoadingId,
        site_of_loading_name: transitPointMaster.transitPointName,
        destination: exportT.destination,
        exit_point_id: exportT.exitPointId,
        // Seals
        dgda_seal_no: exportT.dgdaSealNo,
        number_of_seals: exportT.numberOfSeals,
        // Charge amounts
        ceec_amount: exportT.ceecAmount,
        cgea_amount: exportT.cgeaAmount,
        occ_amount: exportT.occAmount,
        lmc_amount: exportT.lmcAmount,
        ogefrem_amount: exportT.ogefremAmount,
        // Loading / documentation dates
        loading_date: exportT.loadingDate,
        pv_date: exportT.pvDate,
        bp_date: exportT.bpDate,
        demande_attestation_date: exportT.demandeAttestationDate,
        assay_date: exportT.assayDate,
        archive_reference: exportT.archiveReference,
        // Declaration
        ceec_in_date: exportT.ceecInDate,
        ceec_out_date: exportT.ceecOutDate,
        min_div_in_date: exportT.minDivInDate,
        min_div_out_date: exportT.minDivOutDate,
        cgea_doc_ref: exportT.cgeaDocRef,
        segues_rcv_ref: exportT.seguesRcvRef,
        segues_payment_date: exportT.seguesPaymentDate,
        document_status_id: exportT.documentStatusId,
        document_status_name: documentStatusMaster.documentStatus,
        customs_clearing_code: exportT.customsClearingCode,
        dgda_in_date: exportT.dgdaInDate,
        declaration_reference: exportT.declarationReference,
        liquidation_reference: exportT.liquidationReference,
        liquidation_date: exportT.liquidationDate,
        liquidation_paid_by: exportT.liquidationPaidBy,
        liquidation_amount: exportT.liquidationAmount,
        quittance_reference: exportT.quittanceReference,
        quittance_date: exportT.quittanceDate,
        dgda_out_date: exportT.dgdaOutDate,
        gov_docs_in_date: exportT.govDocsInDate,
        gov_docs_out_date: exportT.govDocsOutDate,
        // Logistics
        dispatch_deliver_date: exportT.dispatchDeliverDate,
        kanyaka_arrival_date: exportT.kanyakaArrivalDate,
        kanyaka_departure_date: exportT.kanyakaDepartureDate,
        border_arrival_date: exportT.borderArrivalDate,
        exit_drc_date: exportT.exitDrcDate,
        end_of_formalities_date: exportT.endOfFormalitiesDate,
        truck_status_id: exportT.truckStatusId,
        truck_status_name: truckStatusMaster.truckStatus,
        lmc_id: exportT.lmcId,
        ogefrem_inv_ref: exportT.ogefremInvRef,
        loading_to_dispatch_date: exportT.loadingToDispatchDate,
        lmc_date: exportT.lmcDate,
        ogefrem_date: exportT.ogefremDate,
        audited_date: exportT.auditedDate,
        archived_date: exportT.archivedDate,
        // Status & remarks
        clearing_status_id: exportT.clearingStatusId,
        clearing_status_name: clearingStatusMaster.clearingStatus,
        remarks: exportT.remarks,
        display: exportT.display,
        created_at: exportT.createdAt,
        updated_at: exportT.updatedAt,
      })
      .from(exportT)
      .leftJoin(clientMaster, eq(clientMaster.id, exportT.clientId))
      .leftJoin(licenseT, eq(licenseT.id, exportT.licenseId))
      .leftJoin(kindMaster, eq(kindMaster.id, exportT.kindId))
      .leftJoin(
        typeOfGoodsMaster,
        eq(typeOfGoodsMaster.id, exportT.typeOfGoodsId),
      )
      .leftJoin(
        transportModeMaster,
        eq(transportModeMaster.id, exportT.transportModeId),
      )
      .leftJoin(regimeMaster, eq(regimeMaster.id, exportT.regimeId))
      .leftJoin(
        clearanceMaster,
        eq(clearanceMaster.id, exportT.typesOfClearanceId),
      )
      .leftJoin(
        feetContainerMaster,
        eq(feetContainerMaster.id, exportT.feetContainerId),
      )
      .leftJoin(
        transitPointMaster,
        eq(transitPointMaster.id, exportT.siteOfLoadingId),
      )
      .leftJoin(
        documentStatusMaster,
        eq(documentStatusMaster.id, exportT.documentStatusId),
      )
      .leftJoin(
        truckStatusMaster,
        eq(truckStatusMaster.id, exportT.truckStatusId),
      )
      .leftJoin(
        clearingStatusMaster,
        eq(clearingStatusMaster.id, exportT.clearingStatusId),
      )
      .where(eq(exportT.id, id))
      .limit(1);

    if (!header) throw new NotFoundError('Export not found');

    // exit_point_id is the other transit_point FK — resolve in a
    // small follow-up rather than aliasing the join.
    let exitPointName: string | null = null;
    if (header.exit_point_id) {
      const [tp] = await db
        .select({ name: transitPointMaster.transitPointName })
        .from(transitPointMaster)
        .where(eq(transitPointMaster.id, header.exit_point_id))
        .limit(1);
      exitPointName = tp?.name ?? null;
    }

    return ok({ ...header, exit_point_name: exitPointName });
  },
);

// PUT /api/v1/exports/{id} — replace-in-place update.

export const PUT = withErrorHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const body = exportBodySchema.parse(await req.json());

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(exportT)
        .set({
          ...bodyToInsert(body),
          updatedBy: session.uid,
          updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
        })
        .where(eq(exportT.id, id))
        .returning({ id: exportT.id });
      if (!row) return null;

      await recordAudit(tx, {
        actorId: session.uid,
        action: 'update',
        entityType: 'export',
        entityId: String(id),
        after: body,
      });

      return row.id;
    });

    if (!updated) throw new NotFoundError('Export not found');
    return ok({ id: updated });
  },
);

// DELETE /api/v1/exports/{id} — soft-delete (display='N').

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
        .update(exportT)
        .set({
          display: 'N',
          updatedBy: session.uid,
          updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
        })
        .where(eq(exportT.id, id))
        .returning({ id: exportT.id });
      if (!row) return null;

      await recordAudit(tx, {
        actorId: session.uid,
        action: 'delete',
        entityType: 'export',
        entityId: String(id),
      });

      return row.id;
    });

    if (!deleted) throw new NotFoundError('Export not found');
    return ok({ id: deleted });
  },
);
