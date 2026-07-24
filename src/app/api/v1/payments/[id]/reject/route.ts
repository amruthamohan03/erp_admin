import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { paymentRejectSchema } from '@/schemas';
import { getRoleStageInfo } from '@/db/queries/payments';
import { STAGE_COLUMNS } from '@/lib/payments/stages';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/payments/{id}/reject  { stage, reason }
// Reject at a stage (sets that stage's flag to -1). Eligibility = stage→role map.
export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid payment id', 400);

  const body = paymentRejectSchema.parse(await req.json());
  const { stage, reason } = body;

  const roleInfo = await getRoleStageInfo(session.role_id);
  if (!roleInfo.stages.has(stage)) {
    return fail(`Your role is not permitted to act on the ${stage} stage`, 403);
  }

  const res = await db.execute(sql`SELECT id FROM payment_request_t WHERE id = ${id} AND display = 'Y' LIMIT 1`);
  if ((res as unknown as { rows: unknown[] }).rows.length === 0) return fail('Payment request not found', 404);

  const col = STAGE_COLUMNS[stage];
  await db.execute(sql`
    UPDATE payment_request_t
    SET ${sql.identifier(col.approval)} = -1,
        ${sql.identifier(col.at)} = now(),
        ${sql.identifier(col.by)} = ${session.uid},
        ${sql.identifier(col.notes)} = ${reason},
        updated_by = ${session.uid}, updated_at = now()
    WHERE id = ${id}
  `);
  return ok({ id, stage });
});
