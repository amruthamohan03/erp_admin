'use client';

// How an AI Search answer is drawn: the sentence, the headline figures as
// tiles, and every record it found as a card that opens the record. Shared by
// the header panel (`compact`) and the /ask page.
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Search, Sparkles } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { badgeClass, statusTone } from '@/lib/statusTone';
import { formatDate } from '@/lib/formatDate';
import { NO_VALUE } from '@/lib/displayValue';
import type { AiTurnFigure, AiTurnRecord } from '@/db/schema';

/**
 * What an answer panel draws. A live result (AiSearchResult) and a saved turn
 * re-opened from a conversation both fit it, so the two render identically.
 */
export interface AiAnswerData {
  answer: string;
  figures: AiTurnFigure[];
  records: AiTurnRecord[];
  steps: string[];
}

/** **bold** inside a line — the only inline markup the assistant is asked for. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/**
 * Paragraphs and "- " bullets, rendered as elements — never as HTML, so nothing
 * the model writes can become markup on this page.
 */
function AnswerText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (): void => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul${blocks.length}`} className="space-y-1 ps-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{inline(b)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const line of text.split('\n')) {
    const t = line.trim();
    const bullet = /^[-*•]\s+(.*)$/u.exec(t);
    if (bullet) {
      bullets.push(bullet[1]!);
      continue;
    }
    flush();
    if (t) blocks.push(<p key={`p${blocks.length}`}>{inline(t)}</p>);
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed text-foreground">{blocks}</div>;
}

const THINKING = ['Reading your question…', 'Searching the records…', 'Checking statuses and dates…', 'Writing the answer…'];

/** The wait, shown as progress rather than a frozen box. */
export function AiThinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => Math.min(n + 1, THINKING.length - 1)), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Sparkles className="h-4 w-4 animate-pulse" />
        {THINKING[i]}
      </div>
      <div className="space-y-2" aria-hidden>
        <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function AiError({ message }: { message: string }) {
  return (
    <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

interface AiAnswerProps {
  result: AiAnswerData;
  /** The header panel: fewer columns, smaller type. */
  compact?: boolean;
  /** Called when a record card is opened — the header panel closes itself. */
  onNavigate?: () => void;
}

export default function AiAnswer({ result, compact = false, onNavigate, bare = false }: AiAnswerProps & {
  /** In a chat thread the avatar is drawn by the message row, not here. */
  bare?: boolean;
}) {
  return (
    <div className="space-y-4">
      {bare ? (
        <AnswerText text={result.answer} />
      ) : (
        <div className="flex gap-3">
          <span className="bg-brand-gradient mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <AnswerText text={result.answer} />
          </div>
        </div>
      )}

      {result.figures.length > 0 && (
        <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
          {result.figures.map((f) => (
            <div
              key={f.label}
              className={`rounded-lg border px-3 py-2 ${f.tone ? badgeClass(statusTone(f.tone)) : 'border-border bg-muted/40 text-foreground'}`}
            >
              <div className="text-xl font-bold leading-tight tabular-nums">{f.value.toLocaleString('en')}</div>
              <div className="truncate text-xs opacity-80" title={f.label}>
                {f.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {result.records.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Records ({result.records.length})
          </div>
          <div className={`grid gap-2 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}>
            {result.records.map((r) => (
              <Link
                key={`${r.module}:${r.id}`}
                href={r.link}
                onClick={onNavigate}
                className="group flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-primary">{r.module_label}</span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
                <div className="truncate font-mono text-sm font-semibold text-foreground" title={r.reference ?? undefined}>
                  {r.reference || `#${r.id}`}
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate" translate="no">
                    {r.client || NO_VALUE}
                    {r.date && (
                      <>
                        {' · '}
                        {r.date_label} {formatDate(r.date)}
                      </>
                    )}
                  </span>
                  <StatusBadge status={r.status} className="shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {result.steps.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Search className="h-3 w-3" />
          <span>Searched:</span>
          {result.steps.map((s, i) => (
            <span key={i} className="rounded-full border border-border bg-muted/40 px-2 py-0.5">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
