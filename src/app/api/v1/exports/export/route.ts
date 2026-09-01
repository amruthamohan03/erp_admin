import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, ilike, inArray, lte, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT, clientMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { exportListQuerySchema } from '@/schemas/exports';
import { exportFilterCondition } from '@/db/queries/exportFilters';
import { buildPageExportSheet } from '@/db/queries/pageExport';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/exports/export
//
// Filtered XLSX download of the export-tracking list, honouring the same filters
// as GET /api/v1/exports including the dashboard status cards. Columns come from
// the page definition (see pageExport.ts), so the whole consignment is in the
// file rather than the summary this route used to emit.

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

  // `display = 'Y'` is applied by the export builder.
  const conds: SQL[] = [];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    // Subquery rather than a join — the export projects one table's columns so
    // they line up with the page definition.
    const clientIds = db
      .select({ id: clientMaster.id })
      .from(clientMaster)
      .where(ilike(clientMaster.companyName, like));
    const orClause = or(
      ilike(exportT.mcaRef, like),
      ilike(exportT.invoice, like),
      ilike(exportT.buyer, like),
      inArray(exportT.clientId, clientIds),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(exportT.clientId, q.client_id));
  if (q.license_id) conds.push(eq(exportT.licenseId, q.license_id));
  if (q.clearing_status_id) conds.push(eq(exportT.clearingStatus, q.clearing_status_id));
  if (q.document_status_id) conds.push(eq(exportT.documentStatus, q.document_status_id));
  if (q.regime_id) conds.push(eq(exportT.regime, q.regime_id));
  if (q.truck_status_id) conds.push(eq(exportT.truckStatus, q.truck_status_id));
  if (q.loading_from) conds.push(gte(exportT.loadingDate, q.loading_from));
  if (q.loading_to) conds.push(lte(exportT.loadingDate, q.loading_to));

  // Respect the active dashboard status cards (same shared predicates as the grid).
  const statusFilters = searchParams.get('status_filters');
  if (statusFilters?.trim()) {
    for (const key of statusFilters.split(',').map((s) => s.trim()).filter(Boolean)) {
      const cond = exportFilterCondition(key);
      if (cond) conds.push(cond);
    }
  }

  const sheet = await buildPageExportSheet('export', {
    where: conds.length > 0 ? and(...conds) : undefined,
    sheetName: 'Export Tracking',
  });

  const buf = await buildXlsx([sheet]);
  const res = xlsxResponse(buf, `exports-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
