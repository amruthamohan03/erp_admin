// §4.1 — GET /api/v1/payment-stages: every stage of the Payment Request approval
// chain, active or not, in run order — what Masters → Payment Stages lists.
//
// There is no POST or DELETE, on purpose: each stage writes its own columns on
// payment_request_t, so the five slots are fixed and an unused stage is switched
// off (`display = 'N'`) rather than removed.
import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentStageMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const rows = await db
    .select({
      id: paymentStageMaster.id,
      stage: paymentStageMaster.stage,
      label: paymentStageMaster.label,
      pending_label: paymentStageMaster.pendingLabel,
      sort_order: paymentStageMaster.sortOrder,
      payment_type: paymentStageMaster.paymentType,
      captures_chargeback: paymentStageMaster.capturesChargeback,
      requires_cash_collector: paymentStageMaster.requiresCashCollector,
      captures_documents: paymentStageMaster.capturesDocuments,
      print_signature: paymentStageMaster.printSignature,
      tone: paymentStageMaster.tone,
      display: paymentStageMaster.display,
      updated_at: paymentStageMaster.updatedAt,
    })
    .from(paymentStageMaster)
    .orderBy(asc(paymentStageMaster.sortOrder), asc(paymentStageMaster.id));
  return ok(rows);
});
