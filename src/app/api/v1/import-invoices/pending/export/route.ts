// GET /api/v1/import-invoices/pending/export — the pending list as .xlsx
// (pending sheet + "Dossiers Désactivés" with the reason).
import { NextResponse } from 'next/server';
import { isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { xlsxResponse, dateStamp } from '@/lib/xlsx';
import { buildPendingInvoiceXlsx } from '@/db/queries/invoicePending';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const res = xlsxResponse(await buildPendingInvoiceXlsx('import'), `Import_Pending_Invoicing_${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
