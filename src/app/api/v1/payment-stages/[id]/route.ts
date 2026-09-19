// §4.1 — PUT /api/v1/payment-stages/{id}: edit one stage of the Payment Request
// approval chain. It applies from the next action on — a request waiting on a
// stage that is switched off moves on to the next one in the chain.
import { NextRequest } from 'next/server';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentStageMaster } from '@/db/schema';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { checkPermission } from '@/lib/auth/permissions';
import { paymentStageUpdateSchema } from '@/schemas';
import { recordAudit } from '@/lib/audit/recordAudit';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  if (!(await checkPermission(session, '/masters/payment-stages', 'edit'))) {
    return fail('Your role may not edit Payment Stages — ask for Edit on it under Mapping → Role Menu Mapping.', 403);
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid stage id', 400);

  const body = paymentStageUpdateSchema.parse(await req.json());

  const [before] = await db.select().from(paymentStageMaster).where(eq(paymentStageMaster.id, id)).limit(1);
  if (!before) return fail('That payment stage no longer exists — reload the page.', 404);

  // Switching off the last active stage would make every request read as
  // already approved — the one configuration that pays out with nobody signing.
  if (body.display === 'N') {
    const [other] = await db
      .select({ id: paymentStageMaster.id })
      .from(paymentStageMaster)
      .where(and(eq(paymentStageMaster.display, 'Y'), ne(paymentStageMaster.id, id)))
      .limit(1);
    if (!other) {
      return fail('At least one stage must stay active — a request with no stages would count as approved.', 422, {
        field: 'display',
      });
    }
  }

  const after = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(paymentStageMaster)
      .set({
        label: body.label,
        pendingLabel: body.pending_label,
        sortOrder: body.sort_order,
        paymentType: body.payment_type,
        capturesChargeback: body.captures_chargeback,
        requiresCashCollector: body.requires_cash_collector,
        capturesDocuments: body.captures_documents,
        printSignature: body.print_signature,
        tone: body.tone,
        display: body.display,
        updatedBy: session.uid,
        updatedAt: sql`now()` as unknown as Date,
      })
      .where(eq(paymentStageMaster.id, id))
      .returning();
    // §4.28 — this decides who has to sign before money leaves.
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'settings_change',
      entityType: 'payment-stage',
      entityId: String(id),
      before,
      after: row,
      metadata: { stage: before.stage },
    });
    return row;
  });

  return ok(after);
});
