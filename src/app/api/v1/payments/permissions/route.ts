import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getRoleStageInfo } from '@/db/queries/payments';

// GET /api/v1/payments/permissions — the stages the caller's role may act on,
// so the list UI knows which approve/reject buttons to render.
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const info = await getRoleStageInfo(session.role_id);
  return ok({ stages: Array.from(info.stages), is_approver: info.isApprover, user_id: session.uid });
});
