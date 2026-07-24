import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getLocalDashboard } from '@/db/queries/locals';

// GET /api/v1/locals/dashboard — KPIs, distributions, trend, top clients, recent.
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await getLocalDashboard());
});
