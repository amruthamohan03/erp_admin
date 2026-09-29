// GET /api/v1/invoice-quotation-items?quotation_id= — loads a quotation's line
// items in the invoice-grid shape (grouped by category, names resolved), plus
// the header values the invoice takes from that quotation (ARSP). Shared by
// both the export and import invoice grids (quotation items don't vary by
// invoice kind), so it lives outside the per-kind folders (§4.10).
//
// The header rides along rather than needing a second request: the grid asks
// for a quotation's contents at exactly the moment the header has to follow it,
// and two round trips could land out of order.
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { quotationHeaderForInvoice, quotationItemsForGrid } from '@/db/queries/invoices';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = Number(req.nextUrl.searchParams.get('quotation_id'));
  if (!Number.isInteger(id) || id <= 0) return fail('quotation_id is required', 400);

  const [items, header] = await Promise.all([
    quotationItemsForGrid(id),
    quotationHeaderForInvoice(id),
  ]);

  return ok({ items, header });
});
