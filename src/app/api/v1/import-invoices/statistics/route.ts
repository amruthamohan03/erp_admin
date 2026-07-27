// GET /api/v1/import-invoices/statistics — the 7 dashboard counters.
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { importInvoiceStats } from '@/db/queries/importInvoiceExtras';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await importInvoiceStats());
});
