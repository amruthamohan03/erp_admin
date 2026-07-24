// GET /api/v1/import-invoices — paginated list for the /import-invoices list page.
// The invoice HEADER is created/updated through the transaction-pages runtime
// (POST /api/v1/pages/import-invoices/[id]); this route is read-only list.
import { type NextRequest } from 'next/server';
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { listInvoices } from '@/db/queries/invoices';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') ?? 10) || 10));
  const q = sp.get('q') ?? undefined;
  const status = sp.get('status') ?? 'all';

  const { items, total } = await listInvoices('import', { q, status, page, pageSize });
  return ok(items, { meta: { total, page, pageSize } });
});
