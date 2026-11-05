'use client';

// The one way a screen asks AI Search a question — shared by the header box and
// the /ask page so they cannot drift in what they send or how they fail (§4.10).
import { useCallback, useEffect, useRef, useState } from 'react';
import { safeFetchJson } from '@/lib/safeFetch';
import type { AiSearchResult } from '@/lib/ai/search';

export interface AiSearchState {
  question: string;
  result: AiSearchResult | null;
  error: string | null;
  loading: boolean;
}

/** The last few questions, per browser — a convenience, never a record (CLAUDE.md storage rule). */
const HISTORY_KEY = 'erp:ai-search-history';
const HISTORY_MAX = 8;

export function readAiHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === 'string').slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function pushAiHistory(question: string): string[] {
  const next = [question, ...readAiHistory().filter((q) => q.toLowerCase() !== question.toLowerCase())].slice(0, HISTORY_MAX);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Private window or blocked storage: the search still works, it just isn't remembered.
  }
  return next;
}

export function clearAiHistory(): void {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* nothing stored, nothing to clear */
  }
}

export function useAiSearch() {
  const [state, setState] = useState<AiSearchState>({ question: '', result: null, error: null, loading: false });
  const [history, setHistory] = useState<string[]>([]);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  // A newer question supersedes an older one still in flight.
  const seq = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after mount
    setHistory(readAiHistory());
    void safeFetchJson<{ configured: boolean; message: string | null }>('/api/v1/ai-search').then((res) => {
      if (res.ok && !res.data.configured) setSetupMessage(res.data.message);
    });
  }, []);

  const ask = useCallback(async (raw: string): Promise<void> => {
    const question = raw.trim();
    if (!question) return;
    const mine = ++seq.current;
    setState({ question, result: null, error: null, loading: true });
    setHistory(pushAiHistory(question));
    const res = await safeFetchJson<AiSearchResult>('/api/v1/ai-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (mine !== seq.current) return;
    setState({ question, result: res.ok ? res.data : null, error: res.ok ? null : res.message, loading: false });
  }, []);

  const reset = useCallback((): void => {
    seq.current++;
    setState({ question: '', result: null, error: null, loading: false });
  }, []);

  return { ...state, ask, reset, history, setHistory, setupMessage };
}

/** Questions that show what the search can do — the empty state's starting points. */
export const AI_EXAMPLES = [
  'How many licences expired in the last 30 days?',
  'Which licences expire in the next 2 weeks?',
  'How many import files are in transit?',
  'Payment requests waiting for approval',
] as const;
