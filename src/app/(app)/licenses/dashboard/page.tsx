'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  FileCheck,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { formatDate } from '@/lib/formatDate';

// §4.29 — the Licence dashboard. It answers "what needs attention today" before
// the operator opens the list: what lapses next, how the book divides between
// import and export, and whether the volume is moving.
//
// Every figure comes from /api/v1/licenses/dashboard, which computes them as SQL
// aggregates over live rows. Nothing here counts anything — a number derived
// from the page of rows this screen happens to hold would report the page size.
//
// Every KPI is a LINK into the list, carrying the card bucket that produced it,
// so clicking a figure shows exactly the rows it counted.

interface Dash {
  kpi: {
    total: number; active: number; expiring: number; expired: number;
    annulated: number; modified: number; prorogated: number; inactive: number;
  };
  expiry_outlook: Array<{ label: string; days: number; count: number }>;
  use_split: { import: number; export: number; unclassified: number };
  monthly: Array<{ month: string; month_name: string; applied: number }>;
  expiring_soon: Array<{
    id: number;
    license_number: string | null;
    client_name: string | null;
    bank_name: string | null;
    license_expiry_date: string | null;
    days_left: number;
  }>;
  top_clients: Array<{ client_name: string | null; total: number; active: number }>;
  by_kind: Array<{ kind_name: string | null; total: number }>;
}

const num = (n: number): string => (n ?? 0).toLocaleString();

/**
 * The tiles, in the order the list screen's cards render so the two screens
 * read the same way round. `card` is the bucket the list filters by — the same
 * key /api/v1/licenses/stats counts, so the figure and the rows agree.
 *
 * The three colours the brief names are load-bearing: Active green, Expiring
 * orange, Expired red. The rest stay neutral so those three carry the meaning.
 */
const TILES = [
  { key: 'total', card: 'all', label: 'Total', icon: FileCheck, grad: 'from-indigo-500 to-purple-600' },
  { key: 'expired', card: 'expired', label: 'Expired', icon: CalendarX, grad: 'from-red-500 to-rose-600' },
  { key: 'expiring', card: 'expiring', label: 'Expiring', icon: CalendarClock, grad: 'from-orange-500 to-amber-600' },
  { key: 'active', card: 'active', label: 'Active', icon: CheckCircle2, grad: 'from-emerald-500 to-teal-500' },
  { key: 'annulated', card: 'annulated', label: 'Annulated', icon: XCircle, grad: 'from-slate-500 to-slate-700' },
  { key: 'modified', card: 'modified', label: 'Modified', icon: ShieldCheck, grad: 'from-violet-500 to-indigo-600' },
  { key: 'prorogated', card: 'prorogated', label: 'Prorogated', icon: CalendarPlus, grad: 'from-cyan-500 to-blue-500' },
] as const;

export default function LicenseDashboardPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/licenses/dashboard')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setD(j.data as Dash);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const kpi = d?.kpi;
  // Scale the bars to the busiest month, never to zero — an empty file would
  // otherwise divide by nothing and render every bar full height.
  const maxApplied = Math.max(1, ...(d?.monthly ?? []).map((m) => m.applied));
  const maxOutlook = Math.max(1, ...(d?.expiry_outlook ?? []).map((b) => b.count));
  const splitTotal = Math.max(
    1,
    (d?.use_split.import ?? 0) + (d?.use_split.export ?? 0) + (d?.use_split.unclassified ?? 0),
  );

  return (
    <>
      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <TrendingUp className="h-5 w-5 text-primary-600" /> Licence Dashboard
        </h1>
        <Link href="/licenses" className="btn-neutral btn-sm">
          <FileCheck className="h-4 w-4" /> Open the licence list
        </Link>
      </div>

      {/* ---- KPI tiles ------------------------------------------------- */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {TILES.map((t) => {
          const Icon = t.icon;
          const value = kpi ? kpi[t.key as keyof Dash['kpi']] : 0;
          return (
            <Link
              key={t.key}
              href={t.card === 'all' ? '/licenses' : `/licenses?card=${t.card}`}
              className={`card bg-gradient-to-br ${t.grad} p-4 text-white transition-transform hover:scale-[1.02]`}
            >
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 opacity-90" />
                <span className="text-2xl font-bold tabular-nums">
                  {loading ? '—' : num(value)}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium opacity-90">{t.label}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ---- What lapses next ---------------------------------------- */}
        <div className="card p-4">
          <h2 className="mb-1 font-semibold text-foreground">Expiry outlook</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Cumulative — &ldquo;next 30 days&rdquo; includes the ones due this week.
          </p>
          <div className="space-y-2">
            {(d?.expiry_outlook ?? []).map((b) => (
              <div key={b.days} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-muted-foreground">{b.label}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-gradient-to-r from-orange-500 to-amber-600"
                    style={{ width: `${(b.count / maxOutlook) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                  {b.count}
                </span>
              </div>
            ))}
            {!loading && (d?.expiry_outlook ?? []).every((b) => b.count === 0) && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nothing lapses in the next 90 days.
              </p>
            )}
          </div>
        </div>

        {/* ---- Import vs export ---------------------------------------- */}
        <div className="card p-4">
          <h2 className="mb-1 font-semibold text-foreground">Import vs export</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            From each licence kind&rsquo;s own flags, so re-flagging a kind moves these
            without a deploy.
          </p>
          <div className="mb-3 flex h-6 overflow-hidden rounded">
            <div
              className="bg-gradient-to-r from-sky-500 to-blue-600"
              style={{ width: `${((d?.use_split.import ?? 0) / splitTotal) * 100}%` }}
              title={`Import: ${d?.use_split.import ?? 0}`}
            />
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-500"
              style={{ width: `${((d?.use_split.export ?? 0) / splitTotal) * 100}%` }}
              title={`Export: ${d?.use_split.export ?? 0}`}
            />
            <div
              className="bg-muted"
              style={{ width: `${((d?.use_split.unclassified ?? 0) / splitTotal) * 100}%` }}
              title={`No kind: ${d?.use_split.unclassified ?? 0}`}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">{num(d?.use_split.import ?? 0)}</p>
              <p className="text-xs text-muted-foreground">Import</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">{num(d?.use_split.export ?? 0)}</p>
              <p className="text-xs text-muted-foreground">Export</p>
            </div>
            <div>
              {/* Surfaced rather than hidden: a licence with no kind cannot be
                  classified and its reference would be missing a code (§4.33). */}
              <p className="text-lg font-bold tabular-nums text-foreground">{num(d?.use_split.unclassified ?? 0)}</p>
              <p className="text-xs text-muted-foreground">No kind</p>
            </div>
          </div>

          <h3 className="mb-2 mt-4 text-sm font-semibold text-foreground">By kind</h3>
          <div className="space-y-1">
            {(d?.by_kind ?? []).map((k) => (
              <div key={k.kind_name ?? 'none'} className="flex items-center justify-between text-sm">
                <span className="truncate text-muted-foreground" title={k.kind_name ?? undefined}>
                  {k.kind_name ?? '— no kind —'}
                </span>
                <span className="font-semibold tabular-nums text-foreground">{k.total}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ---- Applications over the year ------------------------------- */}
        <div className="card p-4">
          <h2 className="mb-3 font-semibold text-foreground">Applications — last 12 months</h2>
          <div className="flex h-40 items-end gap-1">
            {(d?.monthly ?? []).map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${m.month_name}: ${m.applied}`}>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {m.applied || ''}
                </span>
                <div
                  className="w-full rounded-t bg-gradient-to-t from-indigo-500 to-purple-600"
                  style={{ height: `${Math.max((m.applied / maxApplied) * 100, m.applied > 0 ? 6 : 1)}%` }}
                />
                {/* §4.19 — a shortened date is still day/month order. */}
                <span className="text-[9px] text-muted-foreground">{m.month_name.slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ---- Busiest clients ------------------------------------------ */}
        <div className="card p-4">
          <h2 className="mb-3 font-semibold text-foreground">Clients by licence count</h2>
          {(d?.top_clients ?? []).length === 0 && !loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No licences on file yet.</p>
          ) : (
            <table className="table-base text-sm">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="text-right">Active</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(d?.top_clients ?? []).map((c) => (
                  <tr key={c.client_name ?? 'none'}>
                    {/* §4.15 — a client as a COLUMN on someone else's row is the code. */}
                    <td className="font-medium">{c.client_name ?? '—'}</td>
                    <td className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{c.active}</td>
                    <td className="text-right font-semibold tabular-nums">{c.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---- The actionable list ---------------------------------------- */}
      <div className="card mt-4 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-foreground">Expiring next</h2>
          <Link href="/licenses?card=expiring" className="btn-neutral btn-sm">
            See all expiring
          </Link>
        </div>
        {(d?.expiring_soon ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {loading ? 'Loading…' : 'Nothing expires in the next 30 days.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base text-sm">
              <thead>
                <tr>
                  <th>Licence</th>
                  <th>Client</th>
                  <th>Bank</th>
                  <th>Expires</th>
                  <th className="text-right">Days left</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(d?.expiring_soon ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono font-medium">{r.license_number ?? '—'}</td>
                    <td>{r.client_name ?? '—'}</td>
                    <td className="max-w-0 truncate" title={r.bank_name ?? undefined}>
                      {r.bank_name ?? '—'}
                    </td>
                    {/* §4.19 — DD-MM-YYYY, through the shared formatter. */}
                    <td>{formatDate(r.license_expiry_date)}</td>
                    <td className="text-right">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold tabular-nums ${
                          r.days_left <= 7
                            ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300'
                            : 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300'
                        }`}
                      >
                        {r.days_left}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link href={`/licenses/${r.id}`} className="btn-edit btn-icon" title="Open">
                        <FileCheck className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
