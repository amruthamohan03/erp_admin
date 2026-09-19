import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getRoleStageInfo, loadPaymentStages } from '@/db/queries/paymentStages';

// GET /api/v1/payments/permissions — what the list screen needs to decide what
// to render: the ACTIVE approval chain (payment_stage_master_t — names, order,
// hues, what each stage asks for) and the caller's grants
// (payment_stage_role_master_t — which stage, at which location). The approve
// and reject routes re-check both; this only keeps the screen from offering a
// button the server would refuse.
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const [info, stages] = await Promise.all([getRoleStageInfo(session.role_id), loadPaymentStages()]);
  return ok({ stages, grants: info.grants, is_approver: info.isApprover, user_id: session.uid });
});
