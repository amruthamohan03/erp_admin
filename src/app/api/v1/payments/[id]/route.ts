import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentRequest } from '@/db/schema';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getPaymentDetail } from '@/db/queries/payments';
import { checkPermission } from '@/lib/auth/permissions';

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

// DELETE /api/v1/payments/{id} — soft delete (§4.27). Gated on the role's
// `can_delete` for the Payment Request menu (§4.7), not on holding an approval
// stage: deciding who may approve and who may delete are separate grants.
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const id = parseId((await params).id);
  if (!id) return fail('Invalid payment id', 400);

  if (!(await checkPermission(session, '/payments', 'delete'))) {
    return fail('Your role may not delete payment requests — ask for Delete on Payment Request under Mapping → Role Menu Mapping.', 403);
  }

  await db
    .update(paymentRequest)
    .set({ display: 'N', updatedBy: session.uid, updatedAt: new Date() })
    .where(eq(paymentRequest.id, id));
  return ok({ id });
});
