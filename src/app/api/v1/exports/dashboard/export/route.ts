import { NextRequest, NextResponse } from 'next/server';
import { isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { buildPageExportSheet } from '@/db/queries/pageExport';
import { buildXlsx, xlsxResponse, dateStamp, type XlsxSheet } from '@/lib/xlsx';
import {
  buildExportCustomSheet,
  buildExportReportSheet,
  exportReport,
} from '@/db/queries/exportDashboardReports';
import { exportDateField } from '@/lib/tracking/exportDateFields';
import {
  exportDashboardExportSchema,
  type ExportDashboardExportQuery,
} from '@/schemas/export-dashboard';

// GET /api/v1/exports/dashboard/export
//
// Every spreadsheet the Export dashboard offers: the four per-tab sheets, the
// combined workbook, the five Report-tab sheets and the custom export.
//
// The tab sheets come from `buildPageExportSheet` — the same builder behind the
// exports list's own Export, which takes its columns from the page definition
// rather than a list kept by hand, so a field added to the Export form appears
// in them with no change here (§4.10). The Report sheets are curated column
// sets an agency expects in a fixed shape, so those are declared in
// `exportDashboardReports.ts` over one shared row.

async function resolve(q: ExportDashboardExportQuery): Promise<{
  sheets: XlsxSheet[];
  filename: string;
}> {
  const filters = { client_id: q.client_id, from: q.from, to: q.to };

  switch (q.scope) {
    case 'report': {
      // Non-null: Zod validated the key against the same registry.
      const def = exportReport(q.report!)!;
      return {
        sheets: [await buildExportReportSheet(def, filters)],
        filename: def.filename,
      };
    }

    case 'custom': {
      const field = exportDateField(q.field!)!;
      return {
        sheets: [await buildExportCustomSheet(field.key, filters, `By ${field.short}`)],
        filename: `export-by-${field.key.replace(/_/gu, '-')}`,
      };
    }

    // The tab sheets are the whole book from one angle, so they carry no date
    // range — the range belongs to the Report tab, which is where an operator
    // goes to narrow one.
    case 'overview':
      return {
        sheets: [await buildPageExportSheet('export', { sheetName: 'Overview' })],
        filename: 'export-overview',
      };
    case 'logistics':
      return {
        sheets: [await buildPageExportSheet('export', { sheetName: 'Logistics' })],
        filename: 'export-logistics',
      };
    case 'triphase':
      return {
        sheets: [await buildPageExportSheet('export', { sheetName: 'Tri Phase' })],
        filename: 'export-triphase',
      };
    case 'prepayment':
      return {
        sheets: [await buildPageExportSheet('export', { sheetName: 'Prepayment' })],
        filename: 'export-prepayment',
      };

    case 'all': {
      // One workbook, one sheet per report, so a month-end pack is a single
      // download instead of six.
      const [overview, ...reports] = await Promise.all([
        buildPageExportSheet('export', { sheetName: 'All Exports' }),
        buildExportReportSheet(exportReport('ogefrem')!, filters),
        buildExportReportSheet(exportReport('lmc')!, filters),
        buildExportReportSheet(exportReport('ceec')!, filters),
        buildExportReportSheet(exportReport('quittance')!, filters),
        buildExportReportSheet(exportReport('dispatch')!, filters),
      ]);
      return { sheets: [overview, ...reports], filename: 'export-dashboard' };
    }
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = exportDashboardExportSchema.parse({
    scope: searchParams.get('scope') ?? undefined,
    report: searchParams.get('report') ?? undefined,
    field: searchParams.get('field') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  });

  const { sheets, filename } = await resolve(q);
  const buf = await buildXlsx(sheets);
  const res = xlsxResponse(buf, `${filename}-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
