'use client';

// AI Search as a conversation: the person's saved chats on the left, the open
// chat on the right, and a composer at the bottom. A question in an open chat
// is a follow-up — the assistant sees the earlier turns.
//
// The URL carries the open chat (`?c=12`), so a chat can be bookmarked, opened
// from the header box, and survives a reload. `?q=` starts a new chat with that
// question, for links that carry one in.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUp, Menu, MessageSquare, Plus, RotateCcw, Search, Sparkles, Trash2, X } from 'lucide-react';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { AI_QUESTION_MAX } from '@/schemas/aiSearch';
import AiAnswer, { AiError, AiThinking } from './AiAnswer';
import { AI_EXAMPLES, useAiChat, useAiConversations } from './useAiSearch';

/** Today's chats show the time; older ones the date (§4.19). */
function when(iso: string): string {
  return formatDate(iso) === formatDate(new Date().toISOString()) ? (formatDateTime(iso).split(' ')[1] ?? '') : formatDate(iso);
}

export default function AiChat() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const list = useAiConversations();
  const [result, setResult] = useState<SaveResult | null>(null);
  const [showList, setShowList] = useState(false);

  const reloadList = list.reload;
  const onSaved = useCallback(
    (c: { id: number }) => {
      // Reflect the chat in the URL, and float it to the top of the list.
      if (params.get('c') !== String(c.id)) router.replace(`${pathname}?c=${c.id}`, { scroll: false });
      void reloadList();
    },
    [params, pathname, router, reloadList],
  );
  const chat = useAiChat(onSaved);
  const { ask, open, newChat, conversationId } = chat;

  // Follow the URL: ?c= opens a saved chat, ?q= starts a new one with a question.
  const handledQ = useRef<string | null>(null);
  const cParam = params.get('c');
  const qParam = params.get('q');
  useEffect(() => {
    if (cParam) {
      const id = Number(cParam);
      if (Number.isInteger(id) && id > 0 && id !== conversationId) void open(id);
      return;
    }
    if (qParam && handledQ.current !== qParam) {
      handledQ.current = qParam;
      newChat();
      void ask(qParam);
    }
    // conversationId deliberately omitted: opening is driven by the URL, and
    // listing it would re-open the chat every time an answer updates it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cParam, qParam, open, newChat, ask]);

  const startNew = (): void => {
    newChat();
    setShowList(false);
    router.replace(pathname, { scroll: false });
  };

  const pick = (id: number): void => {
    setShowList(false);
    router.replace(`${pathname}?c=${id}`, { scroll: false });
  };

  async function remove(id: number, title: string): Promise<void> {
    if (!confirm(`Delete the chat "${title}"? It will no longer appear in your list.`)) return;
    const res = await safeFetchJson(`/api/v1/ai-search/conversations/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: res.message });
      return;
    }
    if (id === conversationId) startNew();
    void list.reload();
    setResult({ status: 'success', title: 'Deleted', message: `The chat "${title}" has been deleted.` });
  }

  const sidebar = (
    <aside className="flex min-h-0 flex-1 flex-col border-border bg-card lg:border-e">
      <div className="space-y-2 border-b border-border p-3">
        <button type="button" onClick={startNew} className="btn-primary btn-sm w-full justify-center">
          <Plus className="h-4 w-4" /> New Chat
        </button>
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input h-9 ps-8"
            placeholder="Search chat titles..."
            aria-label="Search your chats"
            value={list.q}
            onChange={(e) => list.setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.error && <p className="p-2 text-xs text-red-600 dark:text-red-400">{list.error}</p>}
        {!list.error && list.items === null && (
          <div className="space-y-2 p-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        )}
        {list.items?.length === 0 && (
          <p className="p-3 text-center text-xs text-muted-foreground">
            {list.q ? 'No chat title matches that search.' : 'Your chats appear here — ask a question to start one.'}
          </p>
        )}
        <ul className="space-y-0.5">
          {list.items?.map((c) => (
            <li key={c.id} className="group relative">
              <button
                type="button"
                onClick={() => pick(c.id)}
                className={`flex w-full items-center gap-2 rounded-lg py-2 pe-8 ps-2.5 text-start text-sm transition-colors ${
                  c.id === conversationId ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted'
                }`}
                title={c.title}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{when(c.updated_at)}</span>
              </button>
              <button
                type="button"
                onClick={() => void remove(c.id, c.title)}
                className="ico-delete absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-1 opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100"
                title="Delete chat"
                aria-label={`Delete chat ${c.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );

  return (
    <div className="card relative flex h-[calc(100dvh-10rem)] min-h-[30rem] overflow-hidden rounded-2xl p-0">
      {/* The chat list: a column from lg up, a drawer below. */}
      <div className="hidden w-72 shrink-0 lg:flex lg:flex-col">{sidebar}</div>
      {showList && (
        <div className="absolute inset-0 z-20 flex lg:hidden">
          <div className="flex w-72 max-w-[85%] flex-col shadow-2xl">{sidebar}</div>
          <button type="button" className="flex-1 bg-black/40" aria-label="Close chat list" onClick={() => setShowList(false)} />
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setShowList(true)}
            className="btn-neutral btn-icon lg:hidden"
            title="Your chats"
            aria-label="Your chats"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="bg-brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground" title={chat.title ?? undefined}>
            {chat.title ?? 'AI Search'}
          </h1>
          {conversationId !== null && (
            <button type="button" onClick={startNew} className="btn-secondary btn-sm" title="Start a new chat">
              <Plus className="h-4 w-4" /> New
            </button>
          )}
        </header>

        <Thread chat={chat} onExample={(q) => void ask(q)} />

        <Composer
          disabled={!!chat.setupMessage}
          busy={chat.pending !== null}
          onSend={(q) => void ask(q)}
          seed={chat.failed?.question}
        />
      </section>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </div>
  );
}

function Thread({ chat, onExample }: { chat: ReturnType<typeof useAiChat>; onExample: (q: string) => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = chat.turns.length + (chat.pending ? 1 : 0);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [count, chat.failed]);

  const empty = !chat.loading && chat.turns.length === 0 && !chat.pending;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {chat.setupMessage && <AiError message={chat.setupMessage} />}

        {chat.loading && <AiThinking />}

        {empty && !chat.setupMessage && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="bg-brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
              <Sparkles className="h-7 w-7" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-foreground">How can I help?</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Ask about licences, tracking files, invoices or payments — then follow up. Answers use only the records your
                role can open.
              </p>
            </div>
            <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {AI_EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onExample(q)}
                  className="rounded-xl border border-border bg-card px-3 py-2.5 text-start text-sm text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.turns.map((t, i) =>
          t.role === 'user' ? (
            <UserBubble key={i} text={t.content} />
          ) : (
            <AssistantRow key={i}>
              <AiAnswer
                bare
                // The thread is a narrow reading column: the compact grid keeps
                // tiles and record cards from being squeezed into ellipses.
                compact
                result={{ answer: t.content, figures: t.figures ?? [], records: t.records ?? [], steps: t.steps ?? [] }}
              />
            </AssistantRow>
          ),
        )}

        {chat.pending && (
          <>
            <UserBubble text={chat.pending} />
            <AssistantRow>
              <AiThinking />
            </AssistantRow>
          </>
        )}

        {chat.failed && (
          <>
            {chat.failed.question && <UserBubble text={chat.failed.question} faded />}
            <AssistantRow>
              <AiError message={chat.failed.message} />
            </AssistantRow>
          </>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function UserBubble({ text, faded = false }: { text: string; faded?: boolean }) {
  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm ${
          faded ? 'opacity-60' : ''
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function AssistantRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="bg-brand-gradient mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-sm">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * The question box: grows with what is typed, Enter sends, Shift+Enter is a
 * new line. A question that failed comes back into it, ready to retry.
 */
function Composer({
  disabled,
  busy,
  onSend,
  seed,
}: {
  disabled: boolean;
  busy: boolean;
  onSend: (q: string) => void;
  seed?: string;
}) {
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // A failed question is put back, so nothing typed is lost to an error.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the draft after a failed send
    if (seed) setDraft(seed);
  }, [seed]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  const send = (): void => {
    const q = draft.trim();
    if (!q || busy || disabled) return;
    onSend(q);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const tooShort = draft.trim().length > 0 && draft.trim().length < 3;

  return (
    <div className="border-t border-border bg-card px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <textarea
            ref={ref}
            rows={1}
            value={draft}
            maxLength={AI_QUESTION_MAX}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={disabled ? 'AI Search is not set up on this server' : 'Ask a question, or follow up on the answer above…'}
            aria-label="Your question"
            autoFocus
            className="max-h-[200px] min-h-[2.5rem] min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {draft && !busy && (
            <button type="button" onClick={() => setDraft('')} className="btn-neutral btn-icon mb-1" title="Clear" aria-label="Clear the question">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={send}
            disabled={busy || disabled || draft.trim().length < 3}
            className="btn-primary mb-0.5 h-9 w-9 shrink-0 justify-center rounded-xl p-0"
            title={busy ? 'Answering…' : 'Send (Enter)'}
            aria-label="Send"
          >
            {busy ? <RotateCcw className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          {tooShort
            ? 'Question must be at least 3 characters.'
            : 'Enter to send · Shift+Enter for a new line · Answers come only from records your role can open — check important figures on the record itself.'}
        </p>
      </div>
    </div>
  );
}
