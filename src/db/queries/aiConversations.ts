// AI Search conversations — each user's own chats with the assistant.
//
// OWNERSHIP IS IN EVERY QUERY. There is no "get conversation by id": every read
// and write takes the caller's user id and matches it in the WHERE clause, so
// one user's id in the URL can never open another user's chat — it is simply
// "not found". Not even an administrator reads someone else's chats here; what
// a person asked is in the audit log (§4.28), which has its own permission.
import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { aiConversation, type AiTurn } from '@/db/schema';
import { NotFoundError, ValidationError } from '@/lib/errors';

/** A conversation longer than this is better started afresh — the answer quality and cost both degrade. */
export const AI_CONVERSATION_MAX_TURNS = 200;
const TITLE_MAX = 120;

export interface AiConversationSummary {
  id: number;
  title: string;
  updated_at: string;
  turns: number;
}

export interface AiConversationDetail {
  id: number;
  title: string;
  messages: AiTurn[];
  updated_at: string;
}

/** The first question, on one line and shortened — the sidebar's label for the chat. */
export function conversationTitle(question: string): string {
  const flat = question.replace(/\s+/g, ' ').trim();
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1).trimEnd()}…` : flat;
}

const notFound = (id: number): NotFoundError =>
  new NotFoundError(`Conversation #${id} was not found. It may have been deleted — start a new chat.`);

/** My conversations, most recent first. */
export async function listAiConversations(userId: number, q?: string): Promise<AiConversationSummary[]> {
  const rows = await db
    .select({
      id: aiConversation.id,
      title: aiConversation.title,
      updated_at: aiConversation.updatedAt,
      turns: sql<number>`jsonb_array_length(${aiConversation.messages})::int`,
    })
    .from(aiConversation)
    .where(
      and(
        eq(aiConversation.userId, userId),
        eq(aiConversation.display, 'Y'),
        q?.trim() ? ilike(aiConversation.title, `%${q.trim()}%`) : undefined,
      ),
    )
    .orderBy(desc(aiConversation.updatedAt))
    .limit(200);
  return rows.map((r) => ({ ...r, updated_at: new Date(r.updated_at).toISOString() }));
}

/** One of MY conversations, whole. */
export async function getAiConversation(userId: number, id: number): Promise<AiConversationDetail> {
  const [row] = await db
    .select({
      id: aiConversation.id,
      title: aiConversation.title,
      messages: aiConversation.messages,
      updated_at: aiConversation.updatedAt,
    })
    .from(aiConversation)
    .where(and(eq(aiConversation.id, id), eq(aiConversation.userId, userId), eq(aiConversation.display, 'Y')))
    .limit(1);
  if (!row) throw notFound(id);
  return { ...row, messages: row.messages ?? [], updated_at: new Date(row.updated_at).toISOString() };
}

/** The earlier turns of a conversation a follow-up continues — checked for ownership and length. */
export async function historyForFollowUp(userId: number, id: number): Promise<AiTurn[]> {
  const convo = await getAiConversation(userId, id);
  if (convo.messages.length >= AI_CONVERSATION_MAX_TURNS) {
    throw new ValidationError(
      `This conversation has reached ${AI_CONVERSATION_MAX_TURNS} messages — start a new chat to keep asking.`,
      { field: 'conversation_id' },
    );
  }
  return convo.messages;
}

/**
 * Save one exchange: append the question and its answer to an existing
 * conversation of mine, or start a new one titled by the question.
 *
 * The append is a single `messages || $turns` UPDATE, so two answers landing
 * at once both survive rather than one overwriting the other.
 */
export async function saveAiExchange(
  userId: number,
  conversationId: number | null,
  question: AiTurn,
  answer: AiTurn,
): Promise<{ id: number; title: string }> {
  const turns = JSON.stringify([question, answer]);
  if (conversationId == null) {
    const [row] = await db
      .insert(aiConversation)
      .values({ userId, title: conversationTitle(question.content), messages: [question, answer] })
      .returning({ id: aiConversation.id, title: aiConversation.title });
    return row!;
  }
  const [row] = await db
    .update(aiConversation)
    .set({ messages: sql`${aiConversation.messages} || ${turns}::jsonb`, updatedAt: sql`now()` })
    .where(and(eq(aiConversation.id, conversationId), eq(aiConversation.userId, userId), eq(aiConversation.display, 'Y')))
    .returning({ id: aiConversation.id, title: aiConversation.title });
  if (!row) throw notFound(conversationId);
  return row;
}

/** §4.27 — soft delete; the row stays, but it is gone from the person's list. */
export async function deleteAiConversation(userId: number, id: number): Promise<{ id: number; title: string }> {
  const [row] = await db
    .update(aiConversation)
    .set({ display: 'N', updatedAt: sql`now()` })
    .where(and(eq(aiConversation.id, id), eq(aiConversation.userId, userId), eq(aiConversation.display, 'Y')))
    .returning({ id: aiConversation.id, title: aiConversation.title });
  if (!row) throw notFound(id);
  return row;
}
