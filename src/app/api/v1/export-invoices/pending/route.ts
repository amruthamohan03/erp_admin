// GET /api/v1/export-invoices/pending — cleared export files no live invoice
// carries yet, held-back ones included and flagged (the Pending card's modal).
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { pendingInvoiceFiles } from '@/db/queries/invoicePending';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await pendingInvoiceFiles('export'));
});
