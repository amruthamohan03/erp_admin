// GET /api/v1/export-invoices/statistics — the 7 dashboard counters.
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { exportInvoiceStats } from '@/db/queries/exportInvoiceExtras';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await exportInvoiceStats());
});
