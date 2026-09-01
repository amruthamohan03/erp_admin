import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, ilike, inArray, lte, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { importT, clientMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { importListQuerySchema } from '@/schemas/imports';
import { buildPageExportSheet } from '@/db/queries/pageExport';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/imports/export
//
// Filtered XLSX download of the imports list. Honours the same filters as
// GET /api/v1/imports, so "Export" downloads exactly the scope on screen.
//
// The columns come from the page definition (see pageExport.ts) rather than a
// list maintained here: this route used to emit 20 columns for a form with 90
// fields, and a hand-kept list will always drift behind the form it describes.

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
    pageSize: '100', // ignored — exports are not paginated
  });

  // `display = 'Y'` is applied by the export builder, so it is not repeated here.
  const conds: SQL[] = [];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    // The client-name term is a subquery rather than a join: the export selects
    // from one table so its columns line up with the page definition, and a join
    // would put the filter on a table that is not in that projection.
    const clientIds = db
      .select({ id: clientMaster.id })
      .from(clientMaster)
      .where(ilike(clientMaster.companyName, like));
    const orClause = or(
      ilike(importT.mcaRef, like),
      ilike(importT.invoice, like),
      ilike(importT.supplier, like),
      inArray(importT.clientId, clientIds),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(importT.clientId, q.client_id));
  if (q.license_id) conds.push(eq(importT.licenseId, q.license_id));
  if (q.clearing_status_id) conds.push(eq(importT.clearingStatus, q.clearing_status_id));
  if (q.document_status_id) conds.push(eq(importT.documentStatus, q.document_status_id));
  if (q.regime_id) conds.push(eq(importT.regime, q.regime_id));
  if (q.pre_alert_from) conds.push(gte(importT.preAlertDate, q.pre_alert_from));
  if (q.pre_alert_to) conds.push(lte(importT.preAlertDate, q.pre_alert_to));

  const sheet = await buildPageExportSheet('import', {
    where: conds.length > 0 ? and(...conds) : undefined,
    sheetName: 'Import Tracking',
  });

  const buf = await buildXlsx([sheet]);
  const res = xlsxResponse(buf, `imports-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
