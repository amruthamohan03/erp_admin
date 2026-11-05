'use client';

// AI Search, full screen: a large question box, example questions, the answer,
// and this browser's recent questions. The header box opens the same search in a
// panel; both share useAiSearch and AiAnswer (§4.10).
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Clock, Sparkles, Trash2 } from 'lucide-react';
import AiAnswer, { AiError, AiThinking } from '@/modules/ai-search/AiAnswer';
import { AI_EXAMPLES, clearAiHistory, useAiSearch } from '@/modules/ai-search/useAiSearch';
import { AI_QUESTION_MAX } from '@/schemas/aiSearch';

export default function AskPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense>
      <AskPageInner />
    </Suspense>
  );
}

function AskPageInner() {
  const params = useSearchParams();
  const { question, result, error, loading, ask, history, setHistory, setupMessage } = useAiSearch();
  const [draft, setDraft] = useState('');
  const asked = useRef(false);

  // Arriving from the header's "open in AI Search" carries the question along.
  useEffect(() => {
    const q = params.get('q');
    if (q && !asked.current) {
      asked.current = true;
      setDraft(q);
      void ask(q);
    }
  }, [params, ask]);

  const submit = (q: string): void => {
    setDraft(q);
    void ask(q);
  };
  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    submit(draft);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="bg-brand-gradient relative overflow-hidden rounded-2xl p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 start-1/3 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Sparkles className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold">AI Search</h1>
          </div>
          <p className="max-w-2xl text-sm text-white/85">
            Ask in plain words — a file’s status, licences about to expire, what is waiting for approval. Answers come only
            from the modules your role can open, with every record linked.
          </p>
          <form onSubmit={onSubmit} role="search" className="flex flex-col gap-2 sm:flex-row">
            <input
              value={draft}
              maxLength={AI_QUESTION_MAX}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. What is the current status of NMI-IDCOR26-0001?"
              aria-label="Your question"
              autoFocus
              className="h-12 min-w-0 flex-1 rounded-xl border-0 bg-card px-4 text-base text-foreground shadow-md outline-none ring-2 ring-transparent placeholder:text-muted-foreground focus:ring-white/60"
            />
            <button
              type="submit"
              disabled={loading || !draft.trim()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white/20 px-5 font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/30 disabled:opacity-50"
            >
              Ask <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {AI_EXAMPLES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => submit(q)}
                className="rounded-full bg-white/15 px-3 py-1 text-xs text-white ring-1 ring-white/25 transition hover:bg-white/25"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="card min-h-[12rem] p-5">
          {question && (
            <div className="mb-4 border-b border-border pb-3 text-sm font-semibold text-foreground">{question}</div>
          )}
          {setupMessage && <AiError message={setupMessage} />}
          {!setupMessage && loading && <AiThinking />}
          {!setupMessage && error && <AiError message={error} />}
          {!setupMessage && result && <AiAnswer result={result} />}
          {!setupMessage && !loading && !error && !result && (
            <div className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Sparkles className="h-8 w-8 text-primary/60" />
              Ask a question above, or pick one of the examples.
            </div>
          )}
        </div>

        <aside className="card h-fit p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Clock className="h-4 w-4" /> Recent questions
            </h2>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearAiHistory();
                  setHistory([]);
                }}
                className="ico-delete"
                title="Clear recent questions"
                aria-label="Clear recent questions"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Your questions appear here, on this browser only.</p>
          ) : (
            <ul className="space-y-1">
              {history.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => submit(q)}
                    className="w-full truncate rounded-md px-2 py-1.5 text-start text-sm text-foreground transition-colors hover:bg-muted"
                    title={q}
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
