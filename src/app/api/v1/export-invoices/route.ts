// GET /api/v1/export-invoices — DGI-aware paginated list for the /export-invoices
// page (filters: all | validated | not-validated | dgi-verified | dgi-info-done |
// dgi-info-pending; plus search + created-at date range). The invoice HEADER is
// created/updated through the transaction-pages runtime.
import { type NextRequest } from 'next/server';
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { listExportInvoices, type ExportInvoiceFilter } from '@/db/queries/exportInvoiceExtras';

const FILTERS = new Set<ExportInvoiceFilter>([
  'all', 'validated', 'not-validated', 'dgi-verified', 'dgi-info-done', 'dgi-info-pending',
]);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') ?? 25) || 25));
  const rawFilter = sp.get('filter') ?? 'all';
  const filter = FILTERS.has(rawFilter as ExportInvoiceFilter) ? (rawFilter as ExportInvoiceFilter) : 'all';

  const { items, total } = await listExportInvoices({
    q: sp.get('q') ?? undefined,
    filter,
    dateFrom: sp.get('date_from') ?? undefined,
    dateTo: sp.get('date_to') ?? undefined,
    page,
    pageSize,
  });
  return ok(items, { meta: { total, page, pageSize } });
});
