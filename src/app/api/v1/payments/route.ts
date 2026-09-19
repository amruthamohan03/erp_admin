import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { paymentListQuerySchema } from '@/schemas';
import { paymentQueryInput } from '@/lib/payments/query';
import { getRoleStageInfo, listPayments } from '@/db/queries/payments';
import { loadPaymentStages } from '@/db/queries/paymentStages';

// GET /api/v1/payments?q=&status_filter=&from=&to=&client_id=&department=
//                      &pay_for=&payment_type=&currency=&expense_type=&page=&pageSize=
// Role-scoped list of payment requests with the derived approval status columns.
// The filters are `paymentFilterSchema`, shared with /payments/export so the
// sheet and the grid answer with the same rows.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = paymentListQuerySchema.parse(paymentQueryInput(searchParams, ['page', 'pageSize']));
  const offset = (q.page - 1) * q.pageSize;

  const roleInfo = await getRoleStageInfo(session.role_id);
  const stages = await loadPaymentStages();
  const { items, total } = await listPayments(roleInfo, session.uid, stages, q, q.pageSize, offset);

  return ok(items, { meta: { total, page: q.page, pageSize: q.pageSize } });
});
