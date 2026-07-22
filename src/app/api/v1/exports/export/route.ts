import { NextRequest, NextResponse } from 'next/server';
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
} from 'drizzle-orm';
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
import { exportListQuerySchema } from '@/schemas/exports';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/exports/export
// Filtered XLSX download of the exports list. Honours the same
// filters as GET /api/v1/exports.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = exportListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    license_id: searchParams.get('license_id') ?? undefined,
    clearing_status_id: searchParams.get('clearing_status_id') ?? undefined,
    document_status_id: searchParams.get('document_status_id') ?? undefined,
    regime_id: searchParams.get('regime_id') ?? undefined,
    truck_status_id: searchParams.get('truck_status_id') ?? undefined,
    loading_from: searchParams.get('loading_from') ?? undefined,
    loading_to: searchParams.get('loading_to') ?? undefined,
    page: '1',
    pageSize: '100',
  });

  const conds: SQL[] = [eq(exportT.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(exportT.mcaRef, like),
      ilike(exportT.invoice, like),
      ilike(exportT.buyer, like),
      ilike(clientMaster.companyName, like),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(exportT.clientId, q.client_id));
  if (q.license_id) conds.push(eq(exportT.licenseId, q.license_id));
  if (q.clearing_status_id) {
    conds.push(eq(exportT.clearingStatus, q.clearing_status_id));
  }
  if (q.document_status_id) {
    conds.push(eq(exportT.documentStatus, q.document_status_id));
  }
  if (q.regime_id) conds.push(eq(exportT.regime, q.regime_id));
  if (q.truck_status_id) {
    conds.push(eq(exportT.truckStatus, q.truck_status_id));
  }
  if (q.loading_from) conds.push(gte(exportT.loadingDate, q.loading_from));
  if (q.loading_to) conds.push(lte(exportT.loadingDate, q.loading_to));
  const where = and(...conds);

  const rows = await db
    .select({
      id: exportT.id,
      mca_ref: exportT.mcaRef,
      invoice: exportT.invoice,
      buyer: exportT.buyer,
      loading_date: exportT.loadingDate,
      client_code: clientMaster.shortName,
      client_name: clientMaster.companyName,
      license_no: licenseT.licenseNumber,
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
    .leftJoin(regimeMaster, eq(regimeMaster.id, exportT.regime))
    .leftJoin(
      transportModeMaster,
      eq(transportModeMaster.id, exportT.transportMode),
    )
    .leftJoin(currencyMaster, eq(currencyMaster.id, exportT.currency))
    .leftJoin(
      clearingStatusMaster,
      eq(clearingStatusMaster.id, exportT.clearingStatus),
    )
    .leftJoin(
      documentStatusMaster,
      eq(documentStatusMaster.id, exportT.documentStatus),
    )
    .leftJoin(
      truckStatusMaster,
      eq(truckStatusMaster.id, exportT.truckStatus),
    )
    .where(where)
    .orderBy(desc(exportT.id));

  const buf = await buildXlsx([
    {
      name: 'Exports',
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

  const res = xlsxResponse(buf, `exports-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
