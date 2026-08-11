// GET /api/v1/payments/mca-options?client_id=&pay_for=
//
// The client's tracking references for a payment category, feeding the reference
// picker on the payment transaction page. Separate from /payments/[id]/mca
// because the picker has to work on /payments/new, where no request exists yet —
// the same reason /partielle-options sits outside /partielles.
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
  // Both are optional: with no client or a category that has no tracking table
  // (Other / Pre Payment) availableRefs returns an empty list rather than erroring,
  // and the grid falls back to typed or auto-generated references.
  const refs = await availableRefs(
    intOrNull(searchParams.get('client_id')),
    intOrNull(searchParams.get('pay_for')),
  );
  return ok(refs);
});
