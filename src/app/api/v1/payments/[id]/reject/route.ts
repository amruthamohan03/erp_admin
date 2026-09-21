import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { paymentRejectSchema } from '@/schemas';
import { canActOn, getRoleStageInfo, loadPaymentStages } from '@/db/queries/paymentStages';
import { checkRejectable, type PaymentApprovalState } from '@/lib/payments/stages';
import { stageLabel } from '@/lib/payments/stageConfig';
import { rejectPaymentAtStage } from '@/db/queries/payments';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/payments/{id}/reject  { stage, reason }
// Reject at the stage the request is waiting on (sets that stage's flag to -1).
// Eligibility is the same location-aware grant approval uses; the stage must be
// the CURRENT one — rejecting an earlier stage would rewrite a decision already
// made, and a later one has not been reached.
export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid payment id', 400);

  const body = paymentRejectSchema.parse(await req.json());
  const { stage, reason } = body;

  const res = await db.execute(sql`
    SELECT id, payment_type, location_id, dept_approval, finance_approval, management_approval, under_process, paid_approval
    FROM payment_request_t WHERE id = ${id} AND display = 'Y' LIMIT 1
  `);
  const payment = (res as unknown as { rows: (PaymentApprovalState & { id: number; location_id: number | null })[] }).rows[0];
  if (!payment) return fail('Payment request not found', 404);

  const [roleInfo, stages] = await Promise.all([getRoleStageInfo(session.role_id), loadPaymentStages()]);
  const label = stageLabel(stages, stage);
  if (!canActOn(roleInfo, stage, payment.location_id)) {
    return fail(`Your role is not permitted to reject at ${label} for this location — see Mapping → Role Payment Stage Mapping.`, 403);
  }
  const blocked = checkRejectable(stage, payment, stages);
  if (blocked) return fail(blocked, 422);

  await db.transaction(async (tx) => {
    await rejectPaymentAtStage(tx, { id, stage, stageLabel: label, reason, actorUserId: session.uid });
  });
  return ok({ id, stage, stage_label: label });
});
