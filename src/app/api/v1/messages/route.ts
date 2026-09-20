// GET  /api/v1/messages — messages the signed-in user has sent.
// POST /api/v1/messages { role_ids, subject, body, priority } — send a message
// from the sender's role to one or more roles; it lands in each member's inbox
// and on their dashboard. Gated on the /messages menu (view to read, add to send).
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { sendMessageSchema } from '@/schemas';
import { sendMessage, sentMessages } from '@/db/queries/notifications';

export const GET = withErrorHandler(async () => {
  const session = await requirePermission('/messages', 'view');
  if (isResponse(session)) return session;
  return ok(await sentMessages(session.uid));
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/messages', 'add');
  if (isResponse(session)) return session;
  const body = sendMessageSchema.parse(await req.json());
  const result = await sendMessage({
    senderUserId: session.uid,
    senderRoleId: session.role_id,
    roleIds: [...new Set(body.role_ids)],
    subject: body.subject,
    body: body.body,
    priority: body.priority,
  });
  return ok(result, 201);
});
