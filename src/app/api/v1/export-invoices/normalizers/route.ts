// GET /api/v1/export-invoices/normalizers — users eligible to normalise an
// invoice (dept_id = 3), for the DGI-edit "Normalized By" dropdown. Reuses the
// import-invoice normalizers query (same users, no duplication).
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { normalizers } from '@/db/queries/importInvoiceExtras';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await normalizers());
});
