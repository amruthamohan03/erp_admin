// POST /api/v1/payments/mca-validate — batch existence + duplicate check for the
// reference grid (one request for the whole batch; main's validate_mca_batch fix).
import { type NextRequest } from 'next/server';
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { validateRefs } from '@/db/queries/paymentMca';
import { mcaValidateSchema } from '@/schemas/paymentMca';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = mcaValidateSchema.parse(await req.json());
  const verdicts = await validateRefs({
    refs: body.refs,
    payFor: body.pay_for,
    clientId: body.client_id,
    expenseType: body.expense_type,
    paymentId: body.payment_id ?? null,
  });
  return ok(verdicts);
});
