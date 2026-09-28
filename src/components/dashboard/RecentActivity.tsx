'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Anchor, ChevronRight, ClipboardList, FileText, Ship } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/formatDate';

// Recent-activity feed for /dashboard. Four panels (imports, exports,
// quotations, licences), each showing the most recently created rows with the
// client, the date and the amount, linking to the record. One HTTP call to
// /api/v1/dashboard/recent-activity fills all four.

interface ActivityRow {
  id: number;
  ref: string | null;
  client_name: string | null;
  date: string;
  amount: string | null;
  /** Licences only — rendered as a badge, never as text (§4.38). */
  state?: string;
}

interface ActivityPayload {
  imports: ActivityRow[];
  exports: ActivityRow[];
  quotations: ActivityRow[];
  licenses: ActivityRow[];
}

interface PanelDef {
  key: keyof ActivityPayload;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  hrefBase: string;
  /** The module's hue: the accent strip, the icon chip and the count chip. */
  accent: string;
  chip: string;
  emptyMessage: string;
}

// Each module keeps one hue across its strip, its icon and its count, so the
// four panels read as a set rather than four unrelated cards. Both themes are
// stated because a semantic colour has no token (§4.32).
const PANELS: PanelDef[] = [
  {
    key: 'imports',
    title: 'Recent imports',
    icon: Anchor,
    hrefBase: '/imports',
    accent: 'from-indigo-500 to-violet-500',
    chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
    emptyMessage: 'No import files yet — the first one will appear here.',
  },
  {
    key: 'exports',
    title: 'Recent exports',
    icon: Ship,
    hrefBase: '/exports',
    accent: 'from-sky-500 to-blue-600',
    chip: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
    emptyMessage: 'No export files yet — the first one will appear here.',
  },
  {
    key: 'quotations',
    title: 'Recent quotations',
    icon: FileText,
    hrefBase: '/quotations',
    accent: 'from-amber-500 to-orange-500',
    chip: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
    emptyMessage: 'No quotations raised yet.',
  },
  {
    key: 'licenses',
    title: 'Recent licences',
    icon: ClipboardList,
    hrefBase: '/licenses',
    accent: 'from-emerald-500 to-green-600',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    emptyMessage: 'No licences issued yet.',
  },
];

/**
 * Pinned to en-US, deliberately.
 *
 * `toLocaleString()` with no locale follows the MACHINE's regional settings, so
 * the same figure renders `1,250` on one box and `1.250` on another — the same
 * drift §4.19 fixes for dates, and just as misread on a customs file.
 */
const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function fmtAmount(v: string | null): string | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? money.format(n) : null;
}

/** One panel's worth of placeholder rows — holds the layout, so nothing jumps. */
function PanelSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="h-1 w-full bg-muted" />
      <div className="p-4">
        <div className="mb-3 h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RecentActivity() {
  const [data, setData] = useState<ActivityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/dashboard/recent-activity')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setData(j.data as ActivityPayload);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-foreground">Recent activity</h2>

      {/* A failure says so rather than removing the section, which is
          indistinguishable from "there has been no activity". */}
      {failed && !loading && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          Recent activity could not be loaded. Refresh the page to try again.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {loading
          ? PANELS.map((p) => <PanelSkeleton key={p.key} />)
          : !failed &&
            PANELS.map((p) => {
              const rows = data?.[p.key] ?? [];
              const Icon = p.icon;
              return (
                <div key={p.key} className="card overflow-hidden">
                  {/* The accent strip ties the card to its module, the same
                      device the transaction accordions use. */}
                  <div className={`h-1 w-full bg-gradient-to-r ${p.accent}`} />
                  <div className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${p.chip}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <h3 className="truncate text-sm font-semibold text-foreground">{p.title}</h3>
                        {rows.length > 0 && (
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${p.chip}`}>
                            {rows.length}
                          </span>
                        )}
                      </div>
                      <Link
                        href={p.hrefBase}
                        className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary-600 hover:underline"
                      >
                        See all <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>

                    {rows.length === 0 ? (
                      // §4.25 — name what is missing, never just "No data".
                      <p className="py-4 text-center text-xs text-muted-foreground">{p.emptyMessage}</p>
                    ) : (
                      <ul className="space-y-1">
                        {rows.map((r) => {
                          const amount = fmtAmount(r.amount);
                          return (
                            <li key={r.id}>
                              <Link
                                href={`${p.hrefBase}/${r.id}`}
                                className="group flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                              >
                                <span className="min-w-0 flex-1">
                                  <span
                                    className="block truncate font-mono text-[13px] font-medium text-foreground group-hover:text-primary-600"
                                    title={r.ref ?? `#${r.id}`}
                                  >
                                    {r.ref ?? `#${r.id}`}
                                  </span>
                                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    {/* §4.15 — the client is a column on someone
                                        else's row here, so the short code. */}
                                    <span className="truncate">{r.client_name ?? '—'}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="shrink-0">{formatDate(r.date, '')}</span>
                                  </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  {/* §4.38 — a status is a badge, never text. */}
                                  {r.state && <StatusBadge status={r.state} />}
                                  {amount !== null && (
                                    <span className="text-right">
                                      <span className="block font-mono text-[13px] font-semibold tabular-nums text-foreground">
                                        {amount}
                                      </span>
                                      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                                        USD
                                      </span>
                                    </span>
                                  )}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
      </div>
    </section>
  );
}
