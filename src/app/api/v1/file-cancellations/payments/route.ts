// GET /api/v1/file-cancellations/payments?kind=&file_id=
// A cancelled file's payment requests — status, amount, and whether money paid
// on it has been recovered. Behind the icon in the Cancelled Files list.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { cancelledFilePaymentsQuery } from '@/schemas';
import { cancelledFilePayments } from '@/db/queries/fileCancellation';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/tracking/file-cancellation', 'view');
  if (isResponse(session)) return session;
  const q = cancelledFilePaymentsQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await cancelledFilePayments(q.kind, q.file_id));
});
