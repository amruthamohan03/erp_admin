import { NextRequest, NextResponse } from 'next/server';
import { isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { buildInvoiceDashboardExport } from '@/db/queries/invoiceDashboardExport';
import { invoiceDashboardExportSchema } from '@/schemas/invoice-dashboard';

// GET /api/v1/export-invoices/dashboard/export?scope=…
//
// The Export Invoice dashboard's spreadsheets, built from the same query functions
// the screen renders, so a download cannot disagree with a card (§4.15).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const q = invoiceDashboardExportSchema.parse({
    scope: new URL(req.url).searchParams.get('scope') ?? undefined,
  });

  const { sheets, filename } = await buildInvoiceDashboardExport('export', q);
  const buf = await buildXlsx(sheets);
  const res = xlsxResponse(buf, `${filename}-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
