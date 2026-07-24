import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { paymentListQuerySchema } from '@/schemas';
import { getRoleStageInfo, listPayments } from '@/db/queries/payments';

// GET /api/v1/payments?q=&status_filter=&page=&pageSize=
// Role-scoped list of payment requests with the derived approval status columns.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = paymentListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    status_filter: searchParams.get('status_filter') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const roleInfo = await getRoleStageInfo(session.role_id);
  const { items, total } = await listPayments(roleInfo, session.uid, q.status_filter, q.q, q.pageSize, offset);

  return ok(items, { meta: { total, page: q.page, pageSize: q.pageSize } });
});
