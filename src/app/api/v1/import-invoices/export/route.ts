// GET /api/v1/import-invoices/export?profile=debit|invoice|full&date_from=&date_to=
// Excel download (exceljs). debit = all invoices (Debit Note), invoice = validated
// only, full = everything. One row per MCA file, amounts bucketed by item category.
import { type NextRequest, NextResponse } from 'next/server';
import { isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { xlsxResponse, dateStamp } from '@/lib/xlsx';
import { buildImportInvoiceExport, type ExportProfile } from '@/db/queries/importInvoiceExport';

const PROFILES = new Set<ExportProfile>(['debit', 'invoice', 'full']);
const NAMES: Record<ExportProfile, string> = { debit: 'Debit_Note', invoice: 'Invoice', full: 'Full_Export' };

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const sp = req.nextUrl.searchParams;
  const raw = sp.get('profile') ?? 'debit';
  const profile = PROFILES.has(raw as ExportProfile) ? (raw as ExportProfile) : 'debit';

  const buf = await buildImportInvoiceExport(profile, {
    dateFrom: sp.get('date_from') ?? undefined,
    dateTo: sp.get('date_to') ?? undefined,
  });
  // withErrorHandler expects a NextResponse; re-wrap the raw xlsx Response.
  const res = xlsxResponse(buf, `${NAMES[profile]}_${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
