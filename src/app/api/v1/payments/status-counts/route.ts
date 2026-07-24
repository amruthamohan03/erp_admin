import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getRoleStageInfo, getStatusCounts } from '@/db/queries/payments';

// GET /api/v1/payments/status-counts — the 7 stat-card buckets + total,
// scoped to what the caller's role can see.
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const roleInfo = await getRoleStageInfo(session.role_id);
  return ok(await getStatusCounts(roleInfo, session.uid));
});
