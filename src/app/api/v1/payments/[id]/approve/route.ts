import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { paymentApproveSchema } from '@/schemas';
import { canActOn, getRoleStageInfo, loadPaymentStages } from '@/db/queries/paymentStages';
import { STAGE_COLUMNS, checkApprovable, type PaymentApprovalState } from '@/lib/payments/stages';
import { stageLabel } from '@/lib/payments/stageConfig';
import { recordAudit } from '@/lib/audit/recordAudit';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/payments/{id}/approve
//   { stage, cash_collector?, chargeback?, file3_path?, file4_path? }
//
// Advance one approval stage. Everything this decides comes from the two
// masters (§4.1, §4.7): WHO may act is a grant in payment_stage_role_master_t
// (optionally for the request's location only), and WHAT the stage requires —
// its place in the chain, the payment types it applies to, whether it takes a
// chargeback, a cash collector or proof-of-payment documents — is its row in
// payment_stage_master_t.
export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid payment id', 400);

  const body = paymentApproveSchema.parse(await req.json());
  const { stage } = body;

  const res = await db.execute(sql`
    SELECT payment_type, location_id, dept_approval, finance_approval, management_approval, under_process, paid_approval
    FROM payment_request_t WHERE id = ${id} AND display = 'Y' LIMIT 1
  `);
  const payment = (res as unknown as { rows: (PaymentApprovalState & { location_id: number | null })[] }).rows[0];
  if (!payment) return fail('Payment request not found', 404);

  const [roleInfo, stages] = await Promise.all([getRoleStageInfo(session.role_id), loadPaymentStages()]);
  const label = stageLabel(stages, stage);
  if (!canActOn(roleInfo, stage, payment.location_id)) {
    return fail(`Your role is not permitted to approve at ${label} for this location — see Mapping → Role Payment Stage Mapping.`, 403);
  }

  const blocked = checkApprovable(stage, payment, stages);
  if (blocked) return fail(blocked, 422);

  const def = stages.find((s) => s.stage === stage);
  if (def?.requires_cash_collector && !body.cash_collector?.trim()) {
    return fail(`Cash Collector is required to approve at ${label}.`, 422, { field: 'cash_collector' });
  }

  const col = STAGE_COLUMNS[stage];
  const sets: ReturnType<typeof sql>[] = [
    sql`${sql.identifier(col.approval)} = 1`,
    sql`${sql.identifier(col.at)} = now()`,
    sql`${sql.identifier(col.by)} = ${session.uid}`,
  ];
  if (def?.captures_chargeback && body.chargeback != null) sets.push(sql`chargeback = ${body.chargeback}`);
  if (def?.requires_cash_collector && body.cash_collector) {
    sets.push(sql`cash_collector = ${body.cash_collector.trim()}`);
  }
  // Proof of payment — Documents 3 and 4 — on the stages configured to take it.
  if (def?.captures_documents) {
    if (body.file3_path) sets.push(sql`file3_path = ${body.file3_path}`);
    if (body.file4_path) sets.push(sql`file4_path = ${body.file4_path}`);
  }
  sets.push(sql`updated_by = ${session.uid}`, sql`updated_at = now()`);

  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE payment_request_t SET ${sql.join(sets, sql`, `)} WHERE id = ${id}`);
    // §4.28 — in the same transaction as the UPDATE, so there can be no
    // approval without its entry.
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'approve',
      entityType: 'payment_request',
      entityId: String(id),
      before: payment,
      after: { [col.approval]: 1 },
      metadata: {
        stage,
        cash_collector: body.cash_collector ?? null,
        chargeback: body.chargeback ?? null,
        file3_path: body.file3_path ?? null,
        file4_path: body.file4_path ?? null,
      },
    });
  });
  return ok({ id, stage, stage_label: label });
});
