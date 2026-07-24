// GET /api/v1/invoice-quotation-items?quotation_id= — loads a quotation's line
// items in the invoice-grid shape (grouped by category, names resolved). Shared
// by both the export and import invoice grids (quotation items don't vary by
// invoice kind), so it lives outside the per-kind folders (§4.10).
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { quotationItemsForGrid } from '@/db/queries/invoices';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = Number(req.nextUrl.searchParams.get('quotation_id'));
  if (!Number.isInteger(id) || id <= 0) return fail('quotation_id is required', 400);

  return ok(await quotationItemsForGrid(id));
});
