import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentRequest } from '@/db/schema';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getRoleStageInfo, getPaymentDetail } from '@/db/queries/payments';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/v1/payments/{id} — full detail (joined names + approver names + mca lines).
export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const id = parseId((await params).id);
  if (!id) return fail('Invalid payment id', 400);
  const row = await getPaymentDetail(id);
  if (!row) return fail('Payment request not found', 404);
  return ok(row);
});

// DELETE /api/v1/payments/{id} — soft delete. Restricted to roles mapped to the
// 'management' stage (§4.7 — config, not a hardcoded id).
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const id = parseId((await params).id);
  if (!id) return fail('Invalid payment id', 400);

  const roleInfo = await getRoleStageInfo(session.role_id);
  if (!roleInfo.stages.has('management')) {
    return fail('You do not have permission to delete payment requests', 403);
  }

  await db
    .update(paymentRequest)
    .set({ display: 'N', updatedBy: session.uid, updatedAt: new Date() })
    .where(eq(paymentRequest.id, id));
  return ok({ id });
});
