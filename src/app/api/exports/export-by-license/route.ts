// GET /api/exports/export-by-license → multi-sheet Excel, one sheet per license
// number (with a totals row), honouring the same filters as the /export list.
// "License Team" download in the legacy UI.
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { getExportRows } from '@/db/queries/exports';
import { buildExportConditions } from '@/lib/exports/listFilters';
import { buildGroupedExportSheets } from '@/lib/exports/exportWorkbook';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const conditions = buildExportConditions(searchParams);
  const rows = await getExportRows(conditions);
  if (rows.length === 0) return fail('No exports found for the selected filters', 404);

  const sheets = buildGroupedExportSheets(rows, 'license_number');
  const buf = await buildXlsx(sheets);
  return xlsxResponse(buf, `exports-by-license-${dateStamp()}.xlsx`);
}
