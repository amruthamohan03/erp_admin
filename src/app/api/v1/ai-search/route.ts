// GET  /api/v1/ai-search — whether AI Search is set up on this server, so the
//      screen can say so before anyone types a question.
// POST /api/v1/ai-search { question, conversation_id? } — answer one question
//      from the ERP's data and save the exchange to the caller's conversation
//      (a new one when no id is given). Gated on the /ask menu; each lookup is
//      gated again on its own module's menu AND on the caller's client scope,
//      re-checked on every turn.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { aiSearchRequestSchema } from '@/schemas';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit/recordAudit';
import { AI_NOT_CONFIGURED, AI_SEARCH_RESOURCE, aiSearchConfigured, runAiSearch } from '@/lib/ai/search';
import { historyForFollowUp, saveAiExchange } from '@/db/queries/aiConversations';

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
  const { question, conversation_id } = aiSearchRequestSchema.parse(await req.json());

  // Ownership is checked BEFORE the model is called: someone else's
  // conversation id is "not found", and its history is never read.
  const history = conversation_id ? await historyForFollowUp(session.uid, conversation_id) : [];
  const asked = new Date().toISOString();
  const result = await runAiSearch(session, question, history);

  // Saved only once there is an answer: a failed question leaves the
  // conversation as it was, and the screen keeps the draft for a retry.
  const conversation = await saveAiExchange(
    session.uid,
    conversation_id ?? null,
    { role: 'user', content: question, at: asked },
    {
      role: 'assistant',
      content: result.answer,
      at: new Date().toISOString(),
      figures: result.figures,
      records: result.records,
      steps: result.steps,
    },
  );

  // §4.28 — a search is a read; who asked what, and which records it surfaced.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'view',
    entityType: 'ai_search',
    entityId: conversation.id,
    metadata: { question, records: result.records.map((r) => `${r.module}:${r.id}`) },
  });
  return ok({ ...result, conversation });
});
