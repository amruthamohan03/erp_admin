import { NextRequest, NextResponse } from 'next/server';
import { isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { buildPageExportSheet } from '@/db/queries/pageExport';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { importDashboardExportScope } from '@/db/queries/importDashboardExport';
import { importDashboardExportSchema } from '@/schemas/import-dashboard';

// GET /api/v1/imports/dashboard/export
//
// Every spreadsheet the Import dashboard offers, from one route: the Briefing
// list, the border overstay list, a road tracking stage, a missing-date card,
// a pipeline step, and the advanced custom export. Which rows each selects is
// `importDashboardExportScope`; the columns come from the Import page
// definition, exactly as the list's own Export does (§4.10).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = importDashboardExportSchema.parse({
    scope: searchParams.get('scope') ?? undefined,
    stage: searchParams.get('stage') ?? undefined,
    field: searchParams.get('field') ?? undefined,
    step: searchParams.get('step') ?? undefined,
    cleared_only: searchParams.get('cleared_only') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  });

  const { where, title, filename } = await importDashboardExportScope(q);

  const sheet = await buildPageExportSheet('import', {
    where,
    // Excel caps a sheet name at 31 characters and rejects the whole workbook
    // rather than truncating, so a long milestone label is cut here.
    sheetName: title.slice(0, 31),
  });

  const buf = await buildXlsx([sheet]);
  const res = xlsxResponse(buf, `${filename}-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
