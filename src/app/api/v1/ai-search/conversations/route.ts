// GET /api/v1/ai-search/conversations?q= — the caller's own AI Search chats,
// most recent first, optionally searched by title. Never anyone else's.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { AI_SEARCH_RESOURCE } from '@/lib/ai/search';
import { listAiConversations } from '@/db/queries/aiConversations';
import { aiConversationListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(AI_SEARCH_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const { q } = aiConversationListQuerySchema.parse({ q: new URL(req.url).searchParams.get('q') ?? undefined });
  return ok(await listAiConversations(session.uid, q));
});
