// GET  /api/v1/chat/messages?with=&after= — one conversation; reading it marks
//      the other person's messages read. Needs view on /chat. `meta.deleted`
//      names messages, up to `after`, deleted since the screen loaded them.
// POST /api/v1/chat/messages { to, body } — send one message. Needs add on /chat.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { chatThreadQuerySchema, sendChatMessageSchema } from '@/schemas';
import { CHAT_RESOURCE, chatThread, sendChatMessage } from '@/db/queries/chat';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(CHAT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const q = chatThreadQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const thread = await chatThread(session.uid, q.with, q.after);
  // `meta.deleted` lets a polling screen drop messages it already holds.
  return ok(thread.messages, { meta: { deleted: thread.deleted } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(CHAT_RESOURCE, 'add');
  if (isResponse(session)) return session;
  const body = sendChatMessageSchema.parse(await req.json());
  return ok(await sendChatMessage(session.uid, body.to, body.body), 201);
});
