import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getPaymentDashboard } from '@/db/queries/payments';

// GET /api/v1/payments/dashboard — KPIs, status breakdown, monthly trend, top clients.
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await getPaymentDashboard());
});
