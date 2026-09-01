import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseT, clientMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { licenseListQuerySchema } from '@/app/api/v1/licenses/route';
import { buildPageExportSheet } from '@/db/queries/pageExport';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/licenses/export
//
// Filtered XLSX download of the licenses list, honouring the same query params
// as GET /api/v1/licenses. Columns come from the page definition, so every field
// on the License form is in the file (see pageExport.ts).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = licenseListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    page: '1',
    pageSize: '100',
  });

  // `display = 'Y'` is applied by the export builder.
  const conds: SQL[] = [];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const clientIds = db
      .select({ id: clientMaster.id })
      .from(clientMaster)
      .where(ilike(clientMaster.companyName, like));
    const orClause = or(
      ilike(licenseT.licenseNumber, like),
      ilike(licenseT.supplier, like),
      ilike(licenseT.invoiceNumber, like),
      inArray(licenseT.clientId, clientIds),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(licenseT.clientId, q.client_id));
  if (q.status) conds.push(eq(licenseT.status, q.status));

  const sheet = await buildPageExportSheet('license', {
    where: conds.length > 0 ? and(...conds) : undefined,
    sheetName: 'Licenses',
  });

  const buf = await buildXlsx([sheet]);
  const res = xlsxResponse(buf, `licenses-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
