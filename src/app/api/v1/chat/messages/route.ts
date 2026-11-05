// GET  /api/v1/chat/messages?with=&after= — one conversation; reading it marks
//      the other person's messages read. Needs view on /chat.
// POST /api/v1/chat/messages { to, body } — send one message. Needs add on /chat.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { chatThreadQuerySchema, sendChatMessageSchema } from '@/schemas';
import { CHAT_RESOURCE, chatThread, sendChatMessage } from '@/db/queries/chat';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(CHAT_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const q = chatThreadQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await chatThread(session.uid, q.with, q.after));
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(CHAT_RESOURCE, 'add');
  if (isResponse(session)) return session;
  const body = sendChatMessageSchema.parse(await req.json());
  return ok(await sendChatMessage(session.uid, body.to, body.body), 201);
});
