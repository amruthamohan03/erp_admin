import { NextRequest, NextResponse } from 'next/server';
import { ilike, or, type SQL } from 'drizzle-orm';
import { clientMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { clientListQuerySchema } from '@/schemas';
import { buildPageExportSheet } from '@/db/queries/pageExport';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/clients/export
//
// Filtered XLSX download of the clients list — same `q` filter as the list GET,
// no pagination. Columns come from the page definition (see pageExport.ts), so
// the legal, contact and financial sections all reach the spreadsheet rather
// than the nine columns this route used to hand-list.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = clientListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: '1',
    pageSize: '100',
  });

  let where: SQL | undefined;
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    where = or(
      ilike(clientMaster.companyName, like),
      ilike(clientMaster.shortName, like),
      ilike(clientMaster.email, like),
      ilike(clientMaster.contactPerson, like),
      ilike(clientMaster.phone, like),
    );
  }

  const sheet = await buildPageExportSheet('clients', { where, sheetName: 'Clients' });

  const buf = await buildXlsx([sheet]);
  const res = xlsxResponse(buf, `clients-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
