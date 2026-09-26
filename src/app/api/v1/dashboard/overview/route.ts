import type { NextRequest } from 'next/server';
import { isResponse, ok, requireAuth, withErrorHandler } from '@/lib/api';
import { getOverviewDashboard } from '@/db/queries/overviewDashboard';

// GET /api/v1/dashboard/overview
//
// §4.29 — the home dashboard's figures: open work across imports and exports,
// licence expiry, outstanding payments, a twelve-month trend and the busiest
// clients. Every number is a SQL aggregate over live rows.
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await getOverviewDashboard());
});
