// GET /api/v1/export-invoices/export?profile=dn|inv&date_from=&date_to=
// Excel download (exceljs). dn = Debit Note (reimbursable view), inv = Invoice
// (operational + agency). One row per MCA file.
import { type NextRequest, NextResponse } from 'next/server';
import { isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { xlsxResponse, dateStamp } from '@/lib/xlsx';
import { buildExportInvoiceExport, type ExportProfile } from '@/db/queries/exportInvoiceExport';

const PROFILES = new Set<ExportProfile>(['dn', 'inv']);
const NAMES: Record<ExportProfile, string> = { dn: 'Debit_Notes', inv: 'Invoices' };

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const sp = req.nextUrl.searchParams;
  const raw = sp.get('profile') ?? 'dn';
  const profile = PROFILES.has(raw as ExportProfile) ? (raw as ExportProfile) : 'dn';

  const buf = await buildExportInvoiceExport(profile, {
    dateFrom: sp.get('date_from') ?? undefined,
    dateTo: sp.get('date_to') ?? undefined,
  });
  // withErrorHandler expects a NextResponse; re-wrap the raw xlsx Response.
  const res = xlsxResponse(buf, `${NAMES[profile]}_Export_${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
