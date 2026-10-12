'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlarmClock, AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronRight,
  CircleDashed, Clock, Settings2, Timer,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import Toggle from '@/components/ui/Toggle';
import { formatDate } from '@/lib/formatDate';
import { safeFetchJson } from '@/lib/safeFetch';
import { ChartCard, Empty, KpiCard, TabError, TabSkeleton, nf } from '../dashboardUi';
import { useFetchedData } from '@/lib/hooks/useFetchedData';
import type { DelayRow, DelayTrackerData } from '@/db/queries/delayTracker';
import type { DelayStatus, StageOutcome } from '@/lib/delayTracker/resolve';

// §4.29 — the Delay Tracker.
//
// One row per tracked file: when its process started, when it is due, and how
// many days are left. What "late" means is never decided here — it is the
// file's rule in `delay_rule_master_t`, and the screen says which rule it
// applied so the number can be argued with.
//
// Worst first, and completed files hidden by default: this is a list to work
// through, not an archive.

const STATUS_LABEL: Record<DelayStatus, string> = {
  not_started: 'Not Started',
  on_track: 'On Track',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  completed_on_time: 'Completed',
  completed_late: 'Completed Late',
};

/**
 * The hue each status reads as.
 *
 * `statusTone` would class "Not Started" as slate and "Completed Late" as
 * green on the word "Completed", so the tone is stated — §4.38 allows exactly
 * this, for statuses that share a word but not a meaning.
 */
const STATUS_TONE: Record<DelayStatus, 'rose' | 'amber' | 'emerald' | 'sky' | 'slate' | 'violet'> = {
  not_started: 'slate',
  on_track: 'sky',
  due_soon: 'amber',
  overdue: 'rose',
  completed_on_time: 'emerald',
  completed_late: 'violet',
};

/** Days remaining, read as a countdown rather than a bare number. */
function Remaining({ row }: { row: DelayRow }) {
  const { remaining_days: left, status } = row.delay;
  if (left === null) {
    return (
      <span className="text-xs text-muted-foreground" title="No start date, so the clock has not begun">
        —
      </span>
    );
  }
  if (status === 'completed_on_time' || status === 'completed_late') {
    return (
      <span className="text-xs text-muted-foreground">
        {left >= 0 ? `${left} to spare` : `${Math.abs(left)} over`}
      </span>
    );
  }
  const over = left < 0;
  return (
    <span
      className={
        over
          ? 'inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
          : left <= 3
            ? 'inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
            : 'inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
      }
      title={`${row.delay.elapsed_days} of ${row.delay.target_days} ${row.delay.basis} days used`}
    >
      {over && <AlertTriangle className="h-3 w-3" />}
      {over ? `${Math.abs(left)} over` : `${left} left`}
    </span>
  );
}

/** How much of the allowance is spent, as a bar. */
function Progress({ row }: { row: DelayRow }) {
  const { elapsed_days: used, target_days: target } = row.delay;
  if (used === null) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.min(100, target > 0 ? (used / target) * 100 : 100);
  const over = used > target;
  return (
    <span
      className="mx-auto flex h-2 w-24 overflow-hidden rounded-full bg-muted"
      title={`${used} of ${target} ${row.delay.basis} days`}
    >
      <span
        className={over ? 'bg-rose-500' : pct > 75 ? 'bg-amber-500' : 'bg-emerald-500'}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** The sub-periods of one file, shown when its row is expanded. */
function Stages({ stages }: { stages: StageOutcome[] }) {
  const measured = stages.filter((s) => s.days !== null);
  if (measured.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        None of this rule&apos;s sub-periods have started yet.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
      {measured.map((s) => {
        const over = (s.over_by ?? 0) > 0;
        return (
          <div
            key={s.key}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
          >
            <span
              className="h-6 w-1 shrink-0 rounded-full"
              style={{ background: s.color }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-foreground" title={s.label}>
                  {s.label}
                </span>
                {s.priority && (
                  <span className="rounded bg-muted px-1 text-[9px] font-bold uppercase text-muted-foreground">
                    key
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {formatDate(s.from_date)} → {s.to_date ? formatDate(s.to_date) : 'open'}
              </div>
            </div>
            <span
              className={
                over
                  ? 'shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                  : 'shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
              }
              title={`${s.days} days taken, ${s.target} allowed${s.pending ? ' — still open' : ''}`}
            >
              {s.days}/{s.target}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function DelayTrackerView() {
  const [module, setModule] = useState('');
  const [status, setStatus] = useState('');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const url = useMemo(() => {
    const qs = new URLSearchParams();
    if (module) qs.set('module', module);
    if (status) qs.set('status', status);
    if (includeCompleted) qs.set('include_completed', '1');
    const q = qs.toString();
    return `/api/v1/delay-tracker${q ? `?${q}` : ''}`;
  }, [module, status, includeCompleted]);

  const { data, loading, error } = useFetchedData<DelayTrackerData>(url);

  if (error) return <TabError message={error} />;

  const tally = data?.tally;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-foreground">
            <AlarmClock className="h-7 w-7" />
            Delay Tracker
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every open file against the deadline its rule gives it
            {data ? ` — measured as at ${formatDate(data.today)}` : ''}
          </p>
        </div>
        <Link href="/masters/delay-rules" className="btn-neutral btn-sm shrink-0">
          <Settings2 className="h-4 w-4" /> Delay Rules
        </Link>
      </div>

      {!data ? (
        loading ? (
          <TabSkeleton tiles={4} panels={1} />
        ) : null
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <KpiCard value={nf.format(tally!.total)} label="Tracked Files" color="blue" icon={<CalendarClock />} />
            <KpiCard value={nf.format(tally!.overdue)} label="Overdue" sub="Past the allowance" color="red" icon={<AlertTriangle />} />
            <KpiCard value={nf.format(tally!.due_soon)} label="Due Soon" sub="Inside the warning window" color="orange" icon={<Timer />} />
            <KpiCard value={nf.format(tally!.on_track)} label="On Track" color="green" icon={<CheckCircle2 />} />
            <KpiCard value={nf.format(tally!.not_started)} label="Not Started" sub="No start date yet" color="slate" icon={<CircleDashed />} />
          </div>

          <div className="rounded-xl border border-border border-l-4 border-l-[#667eea] bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[160px]">
                <label className="label">Module</label>
                <SearchableSelect
                  value={module}
                  onChange={setModule}
                  options={[
                    { value: 'import', label: 'Import' },
                    { value: 'export', label: 'Export' },
                  ]}
                  emptyLabel="Both"
                  placeholder="Both"
                  aria-label="Module"
                />
              </div>
              <div className="min-w-[180px]">
                <label className="label">Status</label>
                <SearchableSelect
                  value={status}
                  onChange={setStatus}
                  options={(
                    ['overdue', 'due_soon', 'on_track', 'not_started', 'completed_late', 'completed_on_time'] as DelayStatus[]
                  ).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
                  emptyLabel="Any status"
                  placeholder="Any status"
                  aria-label="Status"
                />
              </div>
              <div className="pb-1.5">
                <Toggle
                  checked={includeCompleted}
                  onChange={setIncludeCompleted}
                  label="Include completed files"
                />
              </div>
            </div>
            {data.rules.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Measured by{' '}
                {data.rules.map((r, i) => (
                  <span key={r.key}>
                    {i > 0 && ' · '}
                    <strong className="text-foreground">{r.name}</strong>{' '}
                    {r.start_field} → {r.end_field}, {r.target_days} {r.basis} days
                    {r.transport_letter ? ` (${r.transport_letter} only)` : ''}
                  </span>
                ))}
                .
              </p>
            )}
          </div>

          <DataTable<DelayRow>
            title="Files against their deadline"
            rows={data.rows}
            rowKey={(r) => `${r.module}-${r.id}`}
            loading={loading}
            searchPlaceholder="Search reference, client, rule..."
            tableId="delay-tracker"
            autoColumns={false}
            emptyMessage={
              includeCompleted
                ? 'No files are being tracked — check that a delay rule exists for this module.'
                : 'Nothing is running against a deadline right now. Switch on "Include completed files" to see finished ones.'
            }
            columns={[
              {
                key: 'expand',
                header: '',
                align: 'center',
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="btn-neutral btn-icon"
                    title={expanded === r.id ? 'Hide sub-periods' : 'Show sub-periods'}
                    aria-expanded={expanded === r.id}
                  >
                    {expanded === r.id ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                ),
              },
              { key: 'mca_ref', header: 'Reference', sortable: true, render: (r) => <strong>{r.mca_ref ?? '—'}</strong> },
              // §4.15 — the client is a column on someone else's row, so the code.
              { key: 'client_name', header: 'Client', sortable: true, render: (r) => r.client_name ?? '—' },
              { key: 'module', header: 'Module', render: (r) => (r.module === 'import' ? 'Import' : 'Export') },
              { key: 'transport_mode', header: 'Transport', render: (r) => r.transport_mode ?? '—', defaultHidden: true },
              {
                key: 'rule',
                header: 'Rule',
                value: (r) => r.delay.rule_name,
                render: (r) => (
                  <span className="text-xs text-muted-foreground" title={`${r.delay.target_days} ${r.delay.basis} days`}>
                    {r.delay.rule_name}
                  </span>
                ),
              },
              {
                key: 'start_date',
                header: 'Started',
                sortable: true,
                value: (r) => r.delay.start_date ?? '',
                render: (r) => formatDate(r.delay.start_date),
              },
              {
                key: 'due_date',
                header: 'Due',
                sortable: true,
                value: (r) => r.delay.due_date ?? '',
                render: (r) => formatDate(r.delay.due_date),
              },
              {
                key: 'elapsed',
                header: 'Used',
                align: 'center',
                sortable: true,
                value: (r) => r.delay.elapsed_days ?? -1,
                render: (r) => <Progress row={r} />,
              },
              {
                key: 'remaining',
                header: 'Remaining',
                align: 'center',
                sortable: true,
                // Sorted on the real number so "worst first" is one click; a
                // file with no start date sorts below every measured one.
                value: (r) => r.delay.remaining_days ?? 1e9,
                render: (r) => <Remaining row={r} />,
              },
              {
                key: 'status',
                header: 'Status',
                badge: (r) => STATUS_TONE[r.delay.status],
                value: (r) => STATUS_LABEL[r.delay.status],
                render: (r) => (
                  <StatusBadge status={STATUS_LABEL[r.delay.status]} tone={STATUS_TONE[r.delay.status]} />
                ),
              },
              {
                key: 'clearing_status',
                header: 'Clearing Status',
                badge: true,
                defaultHidden: true,
                render: (r) => <StatusBadge status={r.clearing_status ?? 'Not set'} />,
              },
            ]}
            actions={(row) => ({ edit: `/${row.module}s/${row.id}` })}
          />

          {expanded !== null && (
            <ChartCard title="Sub-periods" icon={<Clock className="h-4 w-4" />}>
              {(() => {
                const row = data.rows.find((r) => r.id === expanded);
                if (!row) return <Empty>That file is no longer in the list.</Empty>;
                return (
                  <>
                    <p className="mb-2 text-sm text-muted-foreground">
                      <strong className="text-foreground">{row.mca_ref ?? `#${row.id}`}</strong> —
                      each leg against its own allowance, in {row.delay.basis} days.
                    </p>
                    <Stages stages={row.delay.stages} />
                  </>
                );
              })()}
            </ChartCard>
          )}
        </>
      )}
    </div>
  );
}
