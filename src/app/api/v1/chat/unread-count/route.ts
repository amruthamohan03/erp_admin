// GET /api/v1/chat/unread-count — the chat button's badge.
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { CHAT_RESOURCE, chatUnreadCount } from '@/db/queries/chat';

export const GET = withErrorHandler(async () => {
  const session = await requirePermission(CHAT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  return ok({ unread: await chatUnreadCount(session.uid) });
});
