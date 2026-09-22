'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Files,
  Gauge,
  Truck,
  XCircle,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { gradient } from '@/components/ui/cardGradient';
import { formatDate } from '@/lib/formatDate';
import { safeFetchJson } from '@/lib/safeFetch';
import type { TrackingDashboard } from '@/db/queries/trackingDashboard';

// §4.29 — the Import and Export Tracking dashboards, from one component.
//
// The two modules ask the same four questions — where are files stuck, how is
// volume moving, what is oldest, who are the biggest clients — over tables that
// differ only in which columns carry the answers. So the screen is written once
// and configured twice (§4.10); the shape of the data is settled server-side in
// `trackingDashboard.ts`.
//
// Charts are inline CSS bars, matching the rest of the app: there is no charting
// dependency in this project and adding one needs a question first (§12). Every
// colour is a token or a semantic hue with both themes stated (§4.20, §4.32).

export interface TrackingDashboardConfig {
  title: string;
  /** e.g. `/api/v1/imports/dashboard`. */
  endpoint: string;
  /** The list this dashboard summarises, e.g. `/imports`. */
  listHref: string;
  /** The delay-KPI screen that owns working-day SLA analysis. */
  kpiHref: string;
  kpiLabel: string;
  /** What the anchor date is called on this module's form. */
  anchorLabel: string;
  /** Plural noun for the records, e.g. "import files". */
  noun: string;
}

const nf = new Intl.NumberFormat('en-US');
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A labelled proportion bar. Width is the only thing that varies. */
function Bar({ value, max, tone = 'primary' }: { value: number; max: number; tone?: 'primary' | 'warning' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={
          tone === 'warning'
            ? 'h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500'
            : 'h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500'
        }
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * A KPI tile. With `href` it is reachable — clicking filters the list to exactly
 * the rows it counted (§4.29). Without one it is a plain figure, because no list
 * filter expresses it and a link that narrowed to something else would lie.
 */
function Tile({
  label,
  value,
  color,
  icon,
  href,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-white/80">{label}</span>
        <span className="text-white/70">{icon}</span>
      </div>
      <div className="mt-2 truncate text-2xl font-bold text-white" title={String(value)}>
        {value}
      </div>
    </>
  );
  const className = `card bg-gradient-to-br ${gradient(color)} p-4`;
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link href={href} className={`${className} transition-transform hover:scale-[1.02]`} title={`Show ${label.toLowerCase()}`}>
      {body}
    </Link>
  );
}

export default function TrackingDashboardView({ config }: { config: TrackingDashboardConfig }) {
  const [data, setData] = useState<TrackingDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await safeFetchJson<TrackingDashboard>(config.endpoint);
      if (cancelled) return;
      if (!res.ok) setError(res.message || 'This dashboard could not be loaded.');
      else setData(res.data ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [config.endpoint]);

  const k = data?.kpi;
  const maxStage = Math.max(1, ...(data?.pending_stages ?? []).map((s) => s.count));
  const maxStatus = Math.max(1, ...(data?.status_breakdown ?? []).map((s) => s.count));
  const maxAge = Math.max(1, ...(data?.ageing ?? []).map((a) => a.count));
  const maxMonth = Math.max(
    1,
    ...(data?.monthly ?? []).flatMap((m) => [m.opened, m.completed]),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-foreground">{config.title}</h1>
        <div className="flex items-center gap-2">
          <Link href={config.kpiHref} className="btn-neutral btn-sm">
            <Gauge className="h-4 w-4" /> {config.kpiLabel}
          </Link>
          <Link href={config.listHref} className="btn-primary btn-sm">
            <Files className="h-4 w-4" /> Open list
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-muted" />
          ))}
        </div>
      )}

      {k && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Total Files" value={nf.format(k.total)} color="violet" icon={<Files className="h-4 w-4" />} href={config.listHref} />
            <Tile label="Open" value={nf.format(k.open)} color="amber" icon={<Clock className="h-4 w-4" />} />
            <Tile label="In Progress" value={nf.format(k.in_progress)} color="sky" icon={<Activity className="h-4 w-4" />} href={`${config.listHref}?status_filters=in_progress`} />
            <Tile label="In Transit" value={nf.format(k.in_transit)} color="cyan" icon={<Truck className="h-4 w-4" />} href={`${config.listHref}?status_filters=in_transit`} />
            <Tile label="Clearing Completed" value={nf.format(k.completed)} color="emerald" icon={<CheckCircle2 className="h-4 w-4" />} href={`${config.listHref}?status_filters=completed`} />
            <Tile label="Cleared (all)" value={nf.format(k.cleared)} color="lime" icon={<CheckCircle2 className="h-4 w-4" />} />
            <Tile label="Cancelled" value={nf.format(k.cancelled)} color="rose" icon={<XCircle className="h-4 w-4" />} />
            <Tile
              label="Avg Days to Clear"
              value={k.avg_days_to_clear === null ? '—' : nf.format(k.avg_days_to_clear)}
              color="slate"
              icon={<CalendarDays className="h-4 w-4" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">This Month ({config.anchorLabel})</div>
              <div className="mt-1 text-2xl font-bold text-foreground">{nf.format(k.this_month)}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Weight</div>
              <div className="mt-1 text-2xl font-bold text-foreground">{nf2.format(k.total_weight)}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Total FOB</div>
              <div className="mt-1 text-2xl font-bold text-foreground">{nf2.format(k.total_fob)}</div>
            </div>
          </div>
        </>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel
            title="Where files are stuck"
            hint={`Open ${config.noun} still missing each step. Click a row to see exactly those files.`}
          >
            <ul className="space-y-2">
              {data.pending_stages.map((s) => (
                <li key={s.key}>
                  <Link
                    href={`${config.listHref}?status_filters=${s.key}`}
                    className="block rounded p-1 hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate text-foreground" title={s.label}>{s.label}</span>
                      <span className="ms-2 font-semibold text-foreground">{nf.format(s.count)}</span>
                    </div>
                    <div className="mt-1">
                      <Bar value={s.count} max={maxStage} tone="warning" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="By clearing status" hint="Every file, grouped by the status master.">
            <ul className="space-y-2">
              {data.status_breakdown.map((s) => (
                <li key={s.status ?? 'none'}>
                  <div className="flex items-center justify-between text-sm">
                    <StatusBadge status={s.status ?? 'Not set'} />
                    <span className="ms-2 font-semibold text-foreground">{nf.format(s.count)}</span>
                  </div>
                  <div className="mt-1">
                    <Bar value={s.count} max={maxStatus} />
                  </div>
                </li>
              ))}
              {data.status_breakdown.length === 0 && (
                <li className="text-sm text-muted-foreground">No files yet.</li>
              )}
            </ul>
          </Panel>

          <Panel
            title="How long open files have been waiting"
            hint={`Calendar days since ${config.anchorLabel}. For working-day targets, see ${config.kpiLabel}.`}
          >
            <ul className="space-y-2">
              {data.ageing.map((a) => (
                <li key={a.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{a.label}</span>
                    <span className="font-semibold text-foreground">{nf.format(a.count)}</span>
                  </div>
                  <div className="mt-1">
                    <Bar value={a.count} max={maxAge} tone="warning" />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Volume over time" hint="Opened and cleared per month, over the last twelve.">
            <div className="flex h-40 items-end gap-1">
              {data.monthly.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${m.month_name}: ${m.opened} opened, ${m.completed} cleared`}>
                  <div className="flex h-32 w-full items-end justify-center gap-0.5">
                    <div
                      className="w-1/2 rounded-t bg-gradient-to-t from-indigo-500 to-violet-500"
                      style={{ height: `${(m.opened / maxMonth) * 100}%` }}
                    />
                    <div
                      className="w-1/2 rounded-t bg-gradient-to-t from-emerald-500 to-green-500"
                      style={{ height: `${(m.completed / maxMonth) * 100}%` }}
                    />
                  </div>
                  <span className="truncate text-[10px] text-muted-foreground">{m.month_name.slice(0, 3)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-violet-500" /> Opened
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Cleared
              </span>
            </div>
          </Panel>
        </div>
      )}

      {data && (
        <DataTable
          title="Oldest open files"
          rows={data.oldest_open}
          rowKey={(r) => r.id}
          searchable={false}
          serial={false}
          customisableColumns={false}
          columnFilters={false}
          autoColumns={false}
          emptyMessage={`No open ${config.noun} — everything has been cleared or cancelled.`}
          columns={[
            { key: 'mca_ref', header: 'Reference', render: (r) => r.mca_ref ?? '—' },
            { key: 'client_name', header: 'Client', render: (r) => r.client_name ?? '—' },
            { key: 'status', header: 'Status', badge: true, render: (r) => <StatusBadge status={r.status ?? 'Not set'} /> },
            { key: 'started', header: config.anchorLabel, render: (r) => formatDate(r.started) },
            {
              key: 'days_open',
              header: 'Days Open',
              align: 'right',
              render: (r) => (
                <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                  {r.days_open >= 90 && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
                  {nf.format(r.days_open)}
                </span>
              ),
            },
          ]}
          actions={(row) => ({ edit: `${config.listHref}/${row.id}` })}
        />
      )}

      {data && (
        <DataTable
          title="Top clients"
          rows={data.top_clients}
          rowKey={(r) => r.client_name ?? 'unknown'}
          searchable={false}
          serial={false}
          customisableColumns={false}
          columnFilters={false}
          autoColumns={false}
          emptyMessage={`No ${config.noun} recorded yet.`}
          columns={[
            // §4.15 — the client is a column on someone else's row, so the code.
            { key: 'client_name', header: 'Client', render: (r) => r.client_name ?? '—' },
            { key: 'files', header: 'Files', align: 'right', render: (r) => nf.format(r.files) },
            { key: 'weight', header: 'Weight', align: 'right', render: (r) => nf2.format(r.weight) },
            { key: 'fob', header: 'FOB', align: 'right', render: (r) => nf2.format(r.fob) },
          ]}
        />
      )}
    </div>
  );
}
