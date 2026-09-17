import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { paymentApproveSchema } from '@/schemas';
import { getRoleStageInfo } from '@/db/queries/payments';
import { STAGE_COLUMNS, STAGE_LABELS, checkApprovable, type PaymentApprovalState } from '@/lib/payments/stages';
import { recordAudit } from '@/lib/audit/recordAudit';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/payments/{id}/approve  { stage, cash_collector?, chargeback? }
// Advance one approval stage. Eligibility is the stage→role map (§4.7); the
// prerequisite/order rules mirror main's workflow.
export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid payment id', 400);

  const body = paymentApproveSchema.parse(await req.json());
  const { stage } = body;

  const roleInfo = await getRoleStageInfo(session.role_id);
  if (!roleInfo.stages.has(stage)) {
    return fail(`Your role is not permitted to act on the ${stage} stage`, 403);
  }

  const res = await db.execute(sql`
    SELECT payment_type, dept_approval, finance_approval, management_approval, under_process, paid_approval
    FROM payment_request_t WHERE id = ${id} AND display = 'Y' LIMIT 1
  `);
  const payment = (res as unknown as { rows: PaymentApprovalState[] }).rows[0];
  if (!payment) return fail('Payment request not found', 404);

  const blocked = checkApprovable(stage, payment);
  if (blocked) return fail(blocked, 422);

  if (stage === 'paid' && !body.cash_collector?.trim()) {
    return fail('Cash collector is required to mark as Paid', 422, { field: 'cash_collector' });
  }

  const col = STAGE_COLUMNS[stage];
  const sets: ReturnType<typeof sql>[] = [
    sql`${sql.identifier(col.approval)} = 1`,
    sql`${sql.identifier(col.at)} = now()`,
    sql`${sql.identifier(col.by)} = ${session.uid}`,
  ];
  if (stage === 'dept' && body.chargeback != null) {
    sets.push(sql`chargeback = ${body.chargeback}`);
  }
  if (stage === 'paid' && body.cash_collector) {
    sets.push(sql`cash_collector = ${body.cash_collector.trim()}`);
  }
  sets.push(sql`updated_by = ${session.uid}`, sql`updated_at = now()`);

  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE payment_request_t SET ${sql.join(sets, sql`, `)} WHERE id = ${id}`);
    // §4.28 — an approval is the most consequential action this module has, and
    // it was the one action not being logged. In the same transaction as the
    // UPDATE, so there can be no approval without its entry.
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'approve',
      entityType: 'payment_request',
      entityId: String(id),
      before: payment,
      after: { [col.approval]: 1 },
      metadata: { stage, cash_collector: body.cash_collector ?? null, chargeback: body.chargeback ?? null },
    });
  });
  return ok({ id, stage, stage_label: STAGE_LABELS[stage] });
});
