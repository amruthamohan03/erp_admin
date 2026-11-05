// GET /api/v1/chat/contacts — everyone the signed-in user can chat with, with
// the last message and unread count per person. Gated on the /chat menu.
// `meta.can_send` tells the screen whether to offer the composer at all, so a
// read-only role sees why it cannot reply instead of a refused send.
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { checkPermission } from '@/lib/auth/permissions';
import { CHAT_RESOURCE, listChatContacts } from '@/db/queries/chat';

export const GET = withErrorHandler(async () => {
  const session = await requirePermission(CHAT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const contacts = await listChatContacts(session.uid);
  const canSend = await checkPermission(session, CHAT_RESOURCE, 'add');
  return ok(contacts, { meta: { can_send: canSend } });
});
