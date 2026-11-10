'use client';

// The AI Search box in the header. Type a question, press Enter, and the answer
// opens in a panel beneath it; Ctrl+K (⌘K) focuses it from anywhere.
//
// Drawn only when the role has the `/ask` menu — the same role-scoped tree the
// sidebar draws (§4.1, §4.7). Below `md` the header has no room for a box, so it
// is an icon that opens the /ask page.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Maximize2, MessageSquare, Sparkles, X } from 'lucide-react';
import { useMenus } from '@/components/layout/MenuProvider';
import { normalisePath, resolveMenuTitle } from '@/lib/pageTitle';
import { AI_QUESTION_MAX } from '@/schemas/aiSearch';
import AiAnswer, { AiError, AiThinking } from './AiAnswer';
import { AI_EXAMPLES, useAiConversations, useAiSearch } from './useAiSearch';

const ASK_PATH = '/ask';

export default function AiSearchBox() {
  const pathname = usePathname();
  const { menus } = useMenus();
  const { question, result, error, loading, ask, setupMessage } = useAiSearch();
  // The four most recent saved chats, offered as one-click ways back in.
  const recent = useAiConversations(4);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const enabled = resolveMenuTitle(ASK_PATH, menus) !== null && normalisePath(pathname) !== ASK_PATH;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [enabled]);

  if (!enabled) return null;

  const submit = (q: string): void => {
    setDraft(q);
    setOpen(true);
    void ask(q);
  };
  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    submit(draft);
  };

  const hasContent = loading || !!result || !!error;

  return (
    <>
      <Link
        href={ASK_PATH}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/15 md:hidden"
        title="AI Search"
        aria-label="AI Search"
      >
        <Sparkles className="h-5 w-5" />
      </Link>

      <div ref={rootRef} className="relative hidden w-full max-w-xl md:block">
        <form onSubmit={onSubmit} role="search">
          <Sparkles className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/80" />
          <input
            ref={inputRef}
            value={draft}
            maxLength={AI_QUESTION_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Ask anything — e.g. status of NMI-IDCOR26-0001"
            aria-label="AI Search — ask a question about licences, files, invoices or payments"
            className="h-10 w-full rounded-full border border-white/25 bg-white/15 pe-16 ps-9 text-sm text-white placeholder:text-white/70 outline-none transition focus:border-white/60 focus:bg-white/25 focus:ring-2 focus:ring-white/30"
          />
          <kbd className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 rounded border border-white/30 px-1.5 text-[10px] font-medium text-white/80">
            Ctrl K
          </kbd>
        </form>

        {open && (
          <div
            className="absolute end-0 start-0 top-12 z-50 max-h-[min(36rem,calc(100vh-6rem))] overflow-y-auto rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl"
            role="dialog"
            aria-label="AI Search answer"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="truncate">{question || 'AI Search'}</span>
              </span>
              <span className="flex items-center gap-1">
                <Link
                  // An answered question is already a saved conversation: open THAT, so
                  // the next question in the full screen is a follow-up to this one.
                  href={result ? `${ASK_PATH}?c=${result.conversation.id}` : question ? `${ASK_PATH}?q=${encodeURIComponent(question)}` : ASK_PATH}
                  onClick={() => setOpen(false)}
                  className="btn-neutral btn-icon"
                  title={result ? "Continue this in AI Search" : "Open in AI Search"}
                  aria-label={result ? "Continue this in AI Search" : "Open in AI Search"}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Link>
                <button type="button" onClick={() => setOpen(false)} className="btn-neutral btn-icon" title="Close" aria-label="Close">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>

            {setupMessage && <AiError message={setupMessage} />}
            {!setupMessage && loading && <AiThinking />}
            {!setupMessage && error && <AiError message={error} />}
            {!setupMessage && result && <AiAnswer result={result} compact onNavigate={() => setOpen(false)} />}

            {!setupMessage && !hasContent && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ask in plain words about licences, tracking files, invoices or payments. Answers use only the modules your role can open.
                </p>
                <div className="flex flex-wrap gap-2">
                  {AI_EXAMPLES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => submit(q)}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
                    >
                      <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                      <span className="truncate">{q}</span>
                    </button>
                  ))}
                </div>
                {recent.items && recent.items.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent chats</div>
                    <ul className="space-y-0.5">
                      {recent.items.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`${ASK_PATH}?c=${c.id}`}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                            title={c.title}
                          >
                            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{c.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
