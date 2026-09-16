import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getLicenseDashboard } from '@/db/queries/licenseDashboard';

// GET /api/v1/licenses/dashboard
//
// KPIs, the expiry outlook, the import/export split, a twelve-month trend, what
// lapses next, and the busiest clients and kinds — every figure a SQL aggregate
// over live rows (§4.29).
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await getLicenseDashboard());
});
