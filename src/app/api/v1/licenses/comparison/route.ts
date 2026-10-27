import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { comparisonQuerySchema } from '@/schemas/comparison';
import { runComparison } from '@/db/queries/comparisonEngine';
import { licensesComparison } from '@/db/queries/comparison/licensesComparison';

// GET /api/v1/licenses/comparison?mode=period|client|direction|office&…
//
// §4.29 — the Licence comparison dashboard. The shared engine builds the slices
// (two periods, up to five clients, import vs export, up to five entry / exit
// posts); `licensesComparison` measures each one.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/licenses/comparison', 'view');
  if (isResponse(session)) return session;
  const sp = new URL(req.url).searchParams;
  const q = comparisonQuerySchema.parse(Object.fromEntries(sp.entries()));
  return ok(await runComparison(licensesComparison, q, q.mode));
});
