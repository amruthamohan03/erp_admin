import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { paymentExportQuerySchema } from '@/schemas';
import { paymentQueryInput } from '@/lib/payments/query';
import { getRoleStageInfo, getStatusCounts } from '@/db/queries/payments';

// GET /api/v1/payments/status-counts?from=&to=&client_id=&… — the 7 stat-card
// buckets + total, scoped to what the caller's role can see AND narrowed by the
// same filters the grid is showing.
//
// It takes the filter schema the list and the export take, so a card and the
// rows it filters to cannot disagree. `status_filter` is parsed and ignored:
// each card counts its own bucket, so applying the selected one would zero the
// other seven.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const filters = paymentExportQuerySchema.parse(paymentQueryInput(searchParams));

  const roleInfo = await getRoleStageInfo(session.role_id);
  return ok(await getStatusCounts(roleInfo, session.uid, filters));
});
