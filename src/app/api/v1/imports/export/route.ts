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
import { importListQuerySchema } from '@/schemas/imports';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/imports/export
// Filtered XLSX download of the imports list. Honours the same
// filters as GET /api/v1/imports so "Export" downloads exactly the
// scope the operator is currently viewing.
//
// No pagination — exports the entire matched set. For large queries
// (>50k rows) this can balloon memory; a future slice may add a
// streaming variant.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = importListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    license_id: searchParams.get('license_id') ?? undefined,
    clearing_status_id: searchParams.get('clearing_status_id') ?? undefined,
    document_status_id: searchParams.get('document_status_id') ?? undefined,
    regime_id: searchParams.get('regime_id') ?? undefined,
    pre_alert_from: searchParams.get('pre_alert_from') ?? undefined,
    pre_alert_to: searchParams.get('pre_alert_to') ?? undefined,
    page: '1',
    pageSize: '100', // ignored — we don't paginate exports
  });

  const conds: SQL[] = [eq(importT.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(importT.mcaRef, like),
      ilike(importT.invoice, like),
      ilike(importT.supplier, like),
      ilike(clientMaster.name, like),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(importT.clientId, q.client_id));
  if (q.license_id) conds.push(eq(importT.licenseId, q.license_id));
  if (q.clearing_status_id) {
    conds.push(eq(importT.clearingStatusId, q.clearing_status_id));
  }
  if (q.document_status_id) {
    conds.push(eq(importT.documentStatusId, q.document_status_id));
  }
  if (q.regime_id) conds.push(eq(importT.regimeId, q.regime_id));
  if (q.pre_alert_from) {
    conds.push(gte(importT.preAlertDate, q.pre_alert_from));
  }
  if (q.pre_alert_to) {
    conds.push(lte(importT.preAlertDate, q.pre_alert_to));
  }
  const where = and(...conds);

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
    .where(where)
    .orderBy(desc(importT.id));

  const buf = await buildXlsx([
    {
      name: 'Imports',
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

  const res = xlsxResponse(buf, `imports-${dateStamp()}.xlsx`);
  // withErrorHandler wraps a NextResponse contract — wrap our raw
  // Response to keep types consistent through the wrapper.
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
