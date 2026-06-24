import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  exportT,
  clientMaster,
  licenseT,
  clearingStatusMaster,
  documentStatusMaster,
  regimeMaster,
  truckStatusMaster,
  transportModeMaster,
  currencyMaster,
} from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/exports/{id}/export
// XLSX download of a single export row — same column shape as the
// list export.

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const rows = await db
      .select({
        id: exportT.id,
        mca_ref: exportT.mcaRef,
        invoice: exportT.invoice,
        buyer: exportT.buyer,
        loading_date: exportT.loadingDate,
        client_code: clientMaster.clientCode,
        client_name: clientMaster.name,
        license_no: licenseT.licenseNo,
        regime: regimeMaster.regimeName,
        transport_mode: transportModeMaster.transportModeName,
        currency: currencyMaster.currencyShortName,
        fob: exportT.fob,
        weight: exportT.weight,
        destination: exportT.destination,
        document_status: documentStatusMaster.documentStatus,
        clearing_status: clearingStatusMaster.clearingStatus,
        truck_status: truckStatusMaster.truckStatus,
        dgda_in_date: exportT.dgdaInDate,
        dgda_out_date: exportT.dgdaOutDate,
        created_at: exportT.createdAt,
      })
      .from(exportT)
      .leftJoin(clientMaster, eq(clientMaster.id, exportT.clientId))
      .leftJoin(licenseT, eq(licenseT.id, exportT.licenseId))
      .leftJoin(regimeMaster, eq(regimeMaster.id, exportT.regimeId))
      .leftJoin(
        transportModeMaster,
        eq(transportModeMaster.id, exportT.transportModeId),
      )
      .leftJoin(currencyMaster, eq(currencyMaster.id, exportT.currencyId))
      .leftJoin(
        clearingStatusMaster,
        eq(clearingStatusMaster.id, exportT.clearingStatusId),
      )
      .leftJoin(
        documentStatusMaster,
        eq(documentStatusMaster.id, exportT.documentStatusId),
      )
      .leftJoin(
        truckStatusMaster,
        eq(truckStatusMaster.id, exportT.truckStatusId),
      )
      .where(eq(exportT.id, id))
      .orderBy(desc(exportT.id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError('Export not found');

    const buf = await buildXlsx([
      {
        name: 'Export',
        columns: [
          { key: 'id', header: 'ID', width: 6 },
          { key: 'mca_ref', header: 'MCA Ref', width: 18 },
          { key: 'invoice', header: 'Invoice', width: 18 },
          { key: 'buyer', header: 'Buyer', width: 24 },
          { key: 'loading_date', header: 'Loading', width: 12 },
          { key: 'client_code', header: 'Client Code', width: 14 },
          { key: 'client_name', header: 'Client', width: 24 },
          { key: 'license_no', header: 'License #', width: 16 },
          { key: 'regime', header: 'Regime', width: 16 },
          { key: 'transport_mode', header: 'Transport', width: 14 },
          { key: 'currency', header: 'CCY', width: 8 },
          { key: 'fob', header: 'FOB', width: 14 },
          { key: 'weight', header: 'Weight (MT)', width: 12 },
          { key: 'destination', header: 'Destination', width: 20 },
          { key: 'document_status', header: 'Doc Status', width: 18 },
          { key: 'clearing_status', header: 'Clearing Status', width: 18 },
          { key: 'truck_status', header: 'Truck Status', width: 18 },
          { key: 'dgda_in_date', header: 'DGDA In', width: 12 },
          { key: 'dgda_out_date', header: 'DGDA Out', width: 12 },
          { key: 'created_at', header: 'Created', width: 18 },
        ],
        rows,
      },
    ]);

    const res = xlsxResponse(buf, `export-${id}-${dateStamp()}.xlsx`);
    return new NextResponse(res.body, {
      status: res.status,
      headers: res.headers,
    });
  },
);
