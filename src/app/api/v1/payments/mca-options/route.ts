// GET /api/v1/payments/mca-options?client_id=&pay_for=&expense_type=&payment_id=
//
// The client's tracking references for a payment category, feeding the reference
// picker on the payment transaction page. Separate from /payments/[id]/mca
// because the picker has to work on /payments/new, where no request exists yet —
// the same reason /partielle-options sits outside /partielles.
//
// `expense_type` is what makes the list correct rather than merely plausible: a
// reference maps ONE-TO-ONE to an expense type, so one already claimed for this
// expense type is not offerable. Withholding it here means an operator cannot
// pick something the save-time duplicate check would reject two clicks later —
// and `consumed` says how many were withheld, so "my file isn't in the list"
// has an answer on screen instead of being a silent empty picker.
import { type NextRequest } from 'next/server';
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { availableRefs } from '@/db/queries/paymentMca';

function intOrNull(v: string | null): number | null {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  // All four are optional: with no client or a category that has no tracking
  // table (Other / Pre Payment) availableRefs returns an empty list rather than
  // erroring, and the grid falls back to typed or auto-generated references.
  const picker = await availableRefs(
    intOrNull(searchParams.get('client_id')),
    intOrNull(searchParams.get('pay_for')),
    intOrNull(searchParams.get('expense_type')),
    intOrNull(searchParams.get('payment_id')),
  );
  return ok(picker);
});
