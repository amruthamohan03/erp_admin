// GET /api/v1/chat/unread-count — the chat button's badge. Also the presence
// heartbeat: this poll runs on every screen while the app is visible, so it is
// what marks the caller online for everyone else's contact list.
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { CHAT_RESOURCE, chatUnreadCount, touchChatPresence } from '@/db/queries/chat';

export const GET = withErrorHandler(async () => {
  const session = await requirePermission(CHAT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  await touchChatPresence(session.uid);
  return ok({ unread: await chatUnreadCount(session.uid) });
});
