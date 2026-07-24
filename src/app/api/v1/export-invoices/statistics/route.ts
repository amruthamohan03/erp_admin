// GET /api/v1/export-invoices/statistics — counts for the list-page stat cards.
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { invoiceStatistics } from '@/db/queries/invoices';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await invoiceStatistics('export'));
});
