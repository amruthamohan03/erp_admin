// GET    /api/v1/ai-search/conversations/{id} — one of the caller's chats, whole.
// DELETE /api/v1/ai-search/conversations/{id} — remove it from their list.
// Another user's id is "not found" — ownership is in every query.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit/recordAudit';
import { AI_SEARCH_RESOURCE } from '@/lib/ai/search';
import { deleteAiConversation, getAiConversation } from '@/db/queries/aiConversations';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError(`"${raw}" is not a valid conversation number.`);
  return id;
}

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(AI_SEARCH_RESOURCE, 'view');
  if (isResponse(session)) return session;
  return ok(await getAiConversation(session.uid, parseId((await params).id)));
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(AI_SEARCH_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const removed = await deleteAiConversation(session.uid, parseId((await params).id));
  await recordAudit(db, {
    actorId: session.uid,
    action: 'delete',
    entityType: 'ai_conversation',
    entityId: removed.id,
    metadata: { title: removed.title },
  });
  return ok(removed);
});
