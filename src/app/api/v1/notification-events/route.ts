// GET /api/v1/notification-events — every system event, what it says and which
// roles it is announced to (Masters → Notification Events).
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { listNotificationEvents } from '@/db/queries/notifications';

export const GET = withErrorHandler(async () => {
  const session = await requirePermission('/masters/notification-events', 'view');
  if (isResponse(session)) return session;
  return ok(await listNotificationEvents());
});
