// GET /api/v1/notifications?kind=&unread=&q=&page=&pageSize= — the signed-in
// user's inbox: alerts raised by status changes and messages sent to their role.
// Personal data, so it needs a session and nothing else — every role has an inbox.
import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { inboxQuerySchema } from '@/schemas';
import { inbox } from '@/db/queries/notifications';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const q = inboxQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const { items, total } = await inbox({ userId: session.uid, roleId: session.role_id }, q);
  return ok(items, { meta: { total, page: q.page, pageSize: q.pageSize } });
});
