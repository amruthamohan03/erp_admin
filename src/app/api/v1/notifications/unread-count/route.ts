// GET /api/v1/notifications/unread-count — the header bell's badge.
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { unreadCounts } from '@/db/queries/notifications';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  return ok(await unreadCounts({ userId: session.uid, roleId: session.role_id }));
});
