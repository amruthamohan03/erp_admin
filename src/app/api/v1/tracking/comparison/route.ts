// GET /api/v1/tracking/comparison — Import and Export Tracking compared by
// period, client, direction or office (§4.29). The engine builds the slices;
// `trackingComparison` says what is measured in each.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { comparisonQuerySchema } from '@/schemas/comparison';
import { runComparison } from '@/db/queries/comparisonEngine';
import { trackingComparison } from '@/db/queries/comparison/trackingComparison';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/tracking/comparison', 'view');
  if (isResponse(session)) return session;
  const sp = new URL(req.url).searchParams;
  const q = comparisonQuerySchema.parse(Object.fromEntries(sp.entries()));
  return ok(await runComparison(trackingComparison, q, q.mode));
});
