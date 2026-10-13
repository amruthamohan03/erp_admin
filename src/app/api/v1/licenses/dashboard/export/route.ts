import { NextRequest, NextResponse } from 'next/server';
import { isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { buildLicenseDashboardExport } from '@/db/queries/licenseDashboardExport';
import { licenseDashboardExportSchema } from '@/schemas/license-dashboard';

// GET /api/v1/licenses/dashboard/export
//
// The dashboard's spreadsheets: the full workbook, either table on its own, or
// one client's profile. Every sheet is built from the same query functions the
// screen renders, so a download can never disagree with the figure that was
// clicked (§4.15).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = licenseDashboardExportSchema.parse({
    scope: searchParams.get('scope') ?? undefined,
    use_for: searchParams.get('use_for') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
  });

  const { sheets, filename } = await buildLicenseDashboardExport(q);
  const buf = await buildXlsx(sheets);
  const res = xlsxResponse(buf, `${filename}-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
