'use client';

// The one way a screen talks to AI Search — shared by the header box and the
// /ask chat so they cannot drift in what they send or how they fail (§4.10).
//
// Conversations are kept on the SERVER, per user (ai_conversation_t): they
// follow the person to another browser, and a follow-up is answered with the
// earlier turns as context. Nothing here is stored in the browser.
import { useCallback, useEffect, useRef, useState } from 'react';
import { safeFetchJson } from '@/lib/safeFetch';
import type { AiSearchResult } from '@/lib/ai/search';
import type { AiTurn } from '@/db/schema';
import type { AiConversationDetail, AiConversationSummary } from '@/db/queries/aiConversations';

/** What POST /ai-search answers: the result, and the conversation it was saved to. */
export type AiAskResponse = AiSearchResult & { conversation: { id: number; title: string } };

/** Whether the server has an API key — asked once, so the screen can say so before anyone types. */
function useSetupMessage(): string | null {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void safeFetchJson<{ configured: boolean; message: string | null }>('/api/v1/ai-search').then((res) => {
      if (res.ok && !res.data.configured) setMessage(res.data.message);
    });
  }, []);
  return message;
}

function postQuestion(question: string, conversationId: number | null) {
  return safeFetchJson<AiAskResponse>('/api/v1/ai-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, conversation_id: conversationId }),
  });
}

/** My conversations, most recent first — the chat sidebar and the header's "recent". */
export function useAiConversations(limit?: number) {
  const [items, setItems] = useState<AiConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const reload = useCallback(async (): Promise<void> => {
    const res = await safeFetchJson<AiConversationSummary[]>(
      `/api/v1/ai-search/conversations${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
    );
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setItems(limit ? res.data.slice(0, limit) : res.data);
  }, [q, limit]);

  useEffect(() => {
    // Debounced, so typing in the search box is one request, not one per key.
    const id = setTimeout(() => void reload(), q ? 250 : 0);
    return () => clearTimeout(id);
  }, [reload, q]);

  return { items, error, q, setQ, reload };
}

// ---------------------------------------------------------------------------
// The header box: one question, one answer, saved as a new conversation that
// the full-screen chat can continue.
// ---------------------------------------------------------------------------

export interface AiSearchState {
  question: string;
  result: AiAskResponse | null;
  error: string | null;
  loading: boolean;
}

export function useAiSearch() {
  const [state, setState] = useState<AiSearchState>({ question: '', result: null, error: null, loading: false });
  const setupMessage = useSetupMessage();
  // A newer question supersedes an older one still in flight.
  const seq = useRef(0);

  const ask = useCallback(async (raw: string): Promise<void> => {
    const question = raw.trim();
    if (!question) return;
    const mine = ++seq.current;
    setState({ question, result: null, error: null, loading: true });
    const res = await postQuestion(question, null);
    if (mine !== seq.current) return;
    setState({ question, result: res.ok ? res.data : null, error: res.ok ? null : res.message, loading: false });
  }, []);

  const reset = useCallback((): void => {
    seq.current++;
    setState({ question: '', result: null, error: null, loading: false });
  }, []);

  return { ...state, ask, reset, setupMessage };
}

// ---------------------------------------------------------------------------
// The /ask chat: a conversation that is opened, continued, and switched.
// ---------------------------------------------------------------------------

export interface AiChatState {
  conversationId: number | null;
  title: string | null;
  turns: AiTurn[];
  /** The question awaiting its answer, drawn at the bottom of the thread. */
  pending: string | null;
  /** The last question that failed, and why — offered for a retry. */
  failed: { question: string; message: string } | null;
  /** Opening a saved conversation. */
  loading: boolean;
}

const EMPTY: AiChatState = { conversationId: null, title: null, turns: [], pending: null, failed: null, loading: false };

export function useAiChat(onSaved?: (conversation: { id: number; title: string }) => void) {
  const [state, setState] = useState<AiChatState>(EMPTY);
  const setupMessage = useSetupMessage();
  // Switching chats while an answer is in flight must not land that answer in
  // the chat now on screen.
  const seq = useRef(0);
  const current = useRef<number | null>(null);

  const ask = useCallback(
    async (raw: string): Promise<void> => {
      const question = raw.trim();
      if (!question) return;
      const mine = ++seq.current;
      const conversationId = current.current;
      setState((s) => ({ ...s, pending: question, failed: null }));
      const res = await postQuestion(question, conversationId);
      if (mine !== seq.current) return;
      if (!res.ok) {
        setState((s) => ({ ...s, pending: null, failed: { question, message: res.message } }));
        return;
      }
      const at = new Date().toISOString();
      const { conversation, answer, figures, records, steps } = res.data;
      current.current = conversation.id;
      setState((s) => ({
        conversationId: conversation.id,
        title: conversation.title,
        pending: null,
        failed: null,
        loading: false,
        turns: [
          ...s.turns,
          { role: 'user', content: question, at },
          { role: 'assistant', content: answer, at, figures, records, steps },
        ],
      }));
      onSaved?.(conversation);
    },
    [onSaved],
  );

  const open = useCallback(async (id: number): Promise<void> => {
    const mine = ++seq.current;
    current.current = id;
    setState({ ...EMPTY, conversationId: id, loading: true });
    const res = await safeFetchJson<AiConversationDetail>(`/api/v1/ai-search/conversations/${id}`);
    if (mine !== seq.current) return;
    if (!res.ok) {
      current.current = null;
      setState({ ...EMPTY, failed: { question: '', message: res.message } });
      return;
    }
    setState({ ...EMPTY, conversationId: res.data.id, title: res.data.title, turns: res.data.messages });
  }, []);

  const newChat = useCallback((): void => {
    seq.current++;
    current.current = null;
    setState(EMPTY);
  }, []);

  return { ...state, ask, open, newChat, setupMessage };
}

/** Questions that show what the search can do — the empty state's starting points. */
export const AI_EXAMPLES = [
  'How many licences expired in the last 30 days?',
  'Which licences expire in the next 2 weeks?',
  'How many import files are in transit?',
  'Payment requests waiting for approval',
] as const;
