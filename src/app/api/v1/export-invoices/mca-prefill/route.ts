// GET /api/v1/export-invoices/mca-prefill?mca_id= — the source export_t row's
// declaration/liquidation/quittance/charge columns, shaped as an MCA-detail row
// so the grid can prefill when the user picks an MCA reference. Export-only:
// import invoices store MCA links as a CSV and don't carry per-MCA detail rows.
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { exportMcaPrefill } from '@/db/queries/invoices';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const mcaId = Number(req.nextUrl.searchParams.get('mca_id'));
  if (!Number.isInteger(mcaId) || mcaId <= 0) return fail('mca_id is required', 400);

  const data = await exportMcaPrefill(mcaId);
  if (!data) return fail('MCA source not found', 404);
  return ok(data);
});
