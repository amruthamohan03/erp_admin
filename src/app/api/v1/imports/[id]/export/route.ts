import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  importT,
  clientMaster,
  licenseT,
  clearingStatusMaster,
  documentStatusMaster,
  regimeMaster,
  transportModeMaster,
  commodityMaster,
  currencyMaster,
} from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/imports/{id}/export
// XLSX download of a single import row. Same column shape as the
// list export so operators can paste it into a master sheet alongside
// other rows. Filename includes the row id for easy filing.

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
        id: importT.id,
        mca_ref: importT.mcaRef,
        invoice: importT.invoice,
        supplier: importT.supplier,
        pre_alert_date: importT.preAlertDate,
        client_code: clientMaster.clientCode,
        client_name: clientMaster.name,
        license_no: licenseT.licenseNo,
        regime: regimeMaster.regimeName,
        transport_mode: transportModeMaster.transportModeName,
        commodity: commodityMaster.commodityName,
        currency: currencyMaster.currencyShortName,
        fob: importT.fob,
        weight: importT.weight,
        m3: importT.m3,
        document_status: documentStatusMaster.documentStatus,
        clearing_status: clearingStatusMaster.clearingStatus,
        dgda_in_date: importT.dgdaInDate,
        dgda_out_date: importT.dgdaOutDate,
        created_at: importT.createdAt,
      })
      .from(importT)
      .leftJoin(clientMaster, eq(clientMaster.id, importT.clientId))
      .leftJoin(licenseT, eq(licenseT.id, importT.licenseId))
      .leftJoin(regimeMaster, eq(regimeMaster.id, importT.regimeId))
      .leftJoin(
        transportModeMaster,
        eq(transportModeMaster.id, importT.transportModeId),
      )
      .leftJoin(commodityMaster, eq(commodityMaster.id, importT.commodityId))
      .leftJoin(currencyMaster, eq(currencyMaster.id, importT.currencyId))
      .leftJoin(
        clearingStatusMaster,
        eq(clearingStatusMaster.id, importT.clearingStatusId),
      )
      .leftJoin(
        documentStatusMaster,
        eq(documentStatusMaster.id, importT.documentStatusId),
      )
      .where(eq(importT.id, id))
      .orderBy(desc(importT.id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError('Import not found');

    const buf = await buildXlsx([
      {
        name: 'Import',
        columns: [
          { key: 'id', header: 'ID', width: 6 },
          { key: 'mca_ref', header: 'MCA Ref', width: 18 },
          { key: 'invoice', header: 'Invoice', width: 18 },
          { key: 'supplier', header: 'Supplier', width: 24 },
          { key: 'pre_alert_date', header: 'Pre-alert', width: 12 },
          { key: 'client_code', header: 'Client Code', width: 14 },
          { key: 'client_name', header: 'Client', width: 24 },
          { key: 'license_no', header: 'License #', width: 16 },
          { key: 'regime', header: 'Regime', width: 16 },
          { key: 'transport_mode', header: 'Transport', width: 14 },
          { key: 'commodity', header: 'Commodity', width: 20 },
          { key: 'currency', header: 'CCY', width: 8 },
          { key: 'fob', header: 'FOB', width: 14 },
          { key: 'weight', header: 'Weight', width: 12 },
          { key: 'm3', header: 'M3', width: 10 },
          { key: 'document_status', header: 'Doc Status', width: 18 },
          { key: 'clearing_status', header: 'Clearing Status', width: 18 },
          { key: 'dgda_in_date', header: 'DGDA In', width: 12 },
          { key: 'dgda_out_date', header: 'DGDA Out', width: 12 },
          { key: 'created_at', header: 'Created', width: 18 },
        ],
        rows,
      },
    ]);

    const res = xlsxResponse(buf, `import-${id}-${dateStamp()}.xlsx`);
    return new NextResponse(res.body, {
      status: res.status,
      headers: res.headers,
    });
  },
);
