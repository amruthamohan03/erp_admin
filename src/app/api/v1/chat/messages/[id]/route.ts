// DELETE /api/v1/chat/messages/{id} — delete a message the caller sent, for
// both sides (soft delete, §4.27). Needs delete on /chat; only the sender may
// delete, which the query checks.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { chatMessageIdParamSchema } from '@/schemas';
import { CHAT_RESOURCE, deleteChatMessage } from '@/db/queries/chat';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(CHAT_RESOURCE, 'delete');
  if (isResponse(session)) return session;
  const { id } = chatMessageIdParamSchema.parse(await params);
  await deleteChatMessage(session.uid, id);
  return ok({ id });
});
