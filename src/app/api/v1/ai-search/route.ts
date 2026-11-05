// GET  /api/v1/ai-search — whether AI Search is set up on this server, so the
//      screen can say so before anyone types a question.
// POST /api/v1/ai-search { question } — answer one question from the ERP's
//      data, scoped to the modules the caller's role may view. Gated on the
//      /ask menu; each lookup is gated again on its own module's menu.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { aiSearchRequestSchema } from '@/schemas';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit/recordAudit';
import { AI_NOT_CONFIGURED, AI_SEARCH_RESOURCE, aiSearchConfigured, runAiSearch } from '@/lib/ai/search';

// An answer can take several lookups; give it room beyond the default.
export const maxDuration = 120;

export const GET = withErrorHandler(async () => {
  const session = await requirePermission(AI_SEARCH_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const configured = aiSearchConfigured();
  return ok({ configured, message: configured ? null : AI_NOT_CONFIGURED });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(AI_SEARCH_RESOURCE, 'view');
  if (isResponse(session)) return session;
  const { question } = aiSearchRequestSchema.parse(await req.json());
  const result = await runAiSearch(session, question);
  // §4.28 — a search is a read; who asked what, and which records it surfaced.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'view',
    entityType: 'ai_search',
    entityId: 0,
    metadata: { question, records: result.records.map((r) => `${r.module}:${r.id}`) },
  });
  return ok(result);
});
