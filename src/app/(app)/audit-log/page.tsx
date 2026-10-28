'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Boxes,
  CalendarClock,
  History,
  LogIn,
  PieChart,
  Pencil,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { DonutChart, HBarChart } from '@/components/charts/Charts';
import { GaugeRing, HeatmapGrid, RadialBars, StackedAreaChart } from '@/components/charts/AdvancedCharts';
import { ChartCard, Empty, KpiCard, TabSkeleton, nf } from '@/modules/tracking/dashboardUi';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDateTime } from '@/lib/formatDate';
import type { AuditStats } from '@/db/queries/auditLog';
import AuditDetailDialog from './AuditDetailDialog';

// §4.28 — the read side of the audit trail, and §4.29 for its dashboard: every
// figure is a SQL aggregate over live rows, honouring the same filters as the
// table, and every card filters the table to exactly what it counted.
//
// Nothing here writes. The trail is append-only, so the page offers view and
// export and no other verb.

interface AuditRow {
  id: string;
  created_at: string;
  actor_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_type: string;
  action: string;
  module: string | null;
  entity_type: string;
  entity_id: string;
  ip_address: string | null;
  user_agent: string | null;
  change_count: number;
}

interface FilterOptions {
  modules: string[];
  actions: string[];
  users: Array<{ id: number; name: string }>;
}

const EMPTY_OPTIONS: FilterOptions = { modules: [], actions: [], users: [] };

const WEEKDAYS = [
  { key: 1, label: 'Mon' },
  { key: 2, label: 'Tue' },
  { key: 3, label: 'Wed' },
  { key: 4, label: 'Thu' },
  { key: 5, label: 'Fri' },
  { key: 6, label: 'Sat' },
  { key: 7, label: 'Sun' },
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Slices past this are folded into "Other" — a ring of twenty is unreadable. */
const DONUT_SLICES = 5;

function humanize(value: string): string {
  return value.replace(/[_-]/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase());
}

/** DD-MM for the daily axis — the year is implied by the 30-day window (§4.19). */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}-${m}` : iso;
}

const fmt = (v: number): string => nf.format(v);

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [options, setOptions] = useState<FilterOptions>(EMPTY_OPTIONS);
  const [canExport, setCanExport] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [actorId, setActorId] = useState('');
  const [moduleKey, setModuleKey] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // One query string for the list, the stats and the export href, so the three
  // can never disagree about what the operator is looking at.
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('q', search.trim());
    if (actorId) p.set('actorId', actorId);
    if (moduleKey) p.set('module', moduleKey);
    if (action) p.set('action', action);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p;
  }, [search, actorId, moduleKey, action, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    const listParams = new URLSearchParams(query);
    listParams.set('page', String(page));
    listParams.set('pageSize', String(pageSize));

    const [list, stat] = await Promise.all([
      safeFetchJson<AuditRow[]>(`/api/v1/audit-log?${listParams}`),
      safeFetchJson<AuditStats>(`/api/v1/audit-log/stats?${query}`),
    ]);

    if (list.ok) {
      setRows(list.data);
      setTotal(typeof list.meta?.total === 'number' ? list.meta.total : list.data.length);
      const opts = list.meta?.options as FilterOptions | undefined;
      if (opts) setOptions(opts);
      setCanExport(list.meta?.can_export_audit === true);
    } else {
      setRows([]);
      setTotal(0);
      setResult({
        status: 'error',
        title: 'Could not load the audit log',
        message: list.message,
        detail: list.detail,
      });
    }
    if (stat.ok) setStats(stat.data);
    setLoading(false);
  }, [query, page, pageSize]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  /** A KPI card toggles the action filter it counts — click again to clear. */
  const filterByAction = useCallback((key: string) => {
    setPage(1);
    setAction((prev) => (prev === key ? '' : key));
  }, []);

  const clearFilters = useCallback(() => {
    setSearch(''); setActorId(''); setModuleKey(''); setAction(''); setFrom(''); setTo('');
    setPage(1);
  }, []);

  const hasFilters = query.toString().length > 0;

  const trend = stats?.by_day_kind ?? [];
  const trendHasData = trend.some((d) => d.changes + d.deletes + d.sessions + d.other > 0);

  const actionSlices = useMemo(() => {
    const all = stats?.by_action ?? [];
    const head = all.slice(0, DONUT_SLICES).map((a) => ({ label: humanize(a.key), value: a.count }));
    const rest = all.slice(DONUT_SLICES).reduce((s, a) => s + a.count, 0);
    return rest > 0 ? [...head, { label: 'Other', value: rest }] : head;
  }, [stats]);

  const heat = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of stats?.by_hour ?? []) m.set(`${c.dow}-${c.hour}`, c.count);
    return m;
  }, [stats]);

  const signInAttempts = (stats?.sign_ins ?? 0) + (stats?.failed_logins ?? 0);

  return (
    <>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <History className="h-6 w-6 text-primary-600" />
          Audit Log
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every consequential action in the system, in the order it happened. The trail is read-only
          — nothing here can be edited or removed.
        </p>
      </div>

      {!stats && loading ? (
        <div className="mb-4">
          <TabSkeleton tiles={6} panels={2} />
        </div>
      ) : (
        <div className="mb-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              color="blue"
              icon={<Activity />}
              label="Entries"
              value={fmt(stats?.total ?? 0)}
              sub={`${fmt(stats?.today ?? 0)} today · ${fmt(stats?.active_users ?? 0)} users`}
            />
            <KpiCard
              color="emerald"
              icon={<Pencil />}
              label="Data Changes"
              value={fmt(stats?.data_changes ?? 0)}
              sub="Creates, updates, deletes"
              onClick={() => filterByAction('update')}
              active={action === 'update'}
            />
            <KpiCard
              color="sky"
              icon={<LogIn />}
              label="Sign-ins"
              value={fmt(stats?.logins ?? 0)}
              sub="Sign-ins and sign-outs"
              onClick={() => filterByAction('login')}
              active={action === 'login'}
            />
            <KpiCard
              color="amber"
              icon={<ShieldAlert />}
              label="Failed Sign-ins"
              value={fmt(stats?.failed_logins ?? 0)}
              sub="Wrong password or disabled account"
              onClick={() => filterByAction('failed_login')}
              active={action === 'failed_login'}
            />
            <KpiCard
              color="rose"
              icon={<Trash2 />}
              label="Deletions"
              value={fmt(stats?.deletes ?? 0)}
              sub="Soft and permanent"
              onClick={() => filterByAction('delete')}
              active={action === 'delete'}
            />
            <KpiCard
              color="violet"
              icon={<RotateCcw />}
              label="Restores"
              value={fmt(stats?.restores ?? 0)}
              sub="Back from the Recycle Bin"
              onClick={() => filterByAction('restore')}
              active={action === 'restore'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title={to ? `Activity — 30 days to ${dayLabel(to)}` : 'Activity — last 30 days'}
              icon={<TrendingUp className="h-4 w-4 text-primary-600" />}
            >
              {trendHasData ? (
                <StackedAreaChart
                  width={700}
                  height={190}
                  labels={trend.map((d) => dayLabel(d.key))}
                  format={fmt}
                  series={[
                    { label: 'Data changes', values: trend.map((d) => d.changes) },
                    { label: 'Sessions', values: trend.map((d) => d.sessions) },
                    { label: 'Other (view, export, print…)', values: trend.map((d) => d.other) },
                    { label: 'Deletions', values: trend.map((d) => d.deletes) },
                  ]}
                />
              ) : (
                <Empty>No activity in this window — widen the date range.</Empty>
              )}
            </ChartCard>

            <ChartCard title="Actions" icon={<PieChart className="h-4 w-4 text-primary-600" />}>
              {actionSlices.length > 0 ? (
                <DonutChart slices={actionSlices} format={fmt} size={150} thickness={22} />
              ) : (
                <Empty>Nothing recorded yet.</Empty>
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title="When activity happens"
              icon={<CalendarClock className="h-4 w-4 text-primary-600" />}
            >
              {(stats?.by_hour.length ?? 0) > 0 ? (
                <HeatmapGrid
                  rows={WEEKDAYS}
                  columns={HOURS}
                  value={(dow, hour) => heat.get(`${dow}-${hour}`) ?? 0}
                  columnLabel={(h) => (h % 3 === 0 ? `${String(h).padStart(2, '0')}h` : '')}
                  format={(v) => `${fmt(v)} ${v === 1 ? 'entry' : 'entries'}`}
                />
              ) : (
                <Empty>Nothing recorded yet.</Empty>
              )}
            </ChartCard>

            <ChartCard title="Sign-in health" icon={<ShieldCheck className="h-4 w-4 text-primary-600" />}>
              <div className="flex flex-col items-center gap-4">
                <GaugeRing
                  label="Successful sign-ins"
                  done={stats?.sign_ins ?? 0}
                  total={signInAttempts}
                  noun="succeeded"
                  colorIndex={2}
                  size={130}
                />
                <dl className="grid w-full grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted/50 p-2">
                    <dt className="text-[11px] text-muted-foreground">Succeeded</dt>
                    <dd className="text-base font-bold text-foreground">{fmt(stats?.sign_ins ?? 0)}</dd>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <dt className="text-[11px] text-muted-foreground">Failed</dt>
                    <dd className="text-base font-bold text-foreground">{fmt(stats?.failed_logins ?? 0)}</dd>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <dt className="text-[11px] text-muted-foreground">Active users</dt>
                    <dd className="text-base font-bold text-foreground">{fmt(stats?.active_users ?? 0)}</dd>
                  </div>
                </dl>
              </div>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="By module" icon={<Boxes className="h-4 w-4 text-primary-600" />}>
              <HBarChart
                items={(stats?.by_module ?? []).slice(0, 8).map((m) => ({ label: humanize(m.key), value: m.count }))}
                format={fmt}
                emptyLabel="Nothing recorded yet."
              />
            </ChartCard>
            <ChartCard title="Most active users" icon={<Users className="h-4 w-4 text-primary-600" />}>
              <RadialBars
                items={(stats?.by_user ?? []).map((u) => ({ label: u.key === 'system' ? 'System' : u.key, value: u.count }))}
                format={fmt}
                emptyLabel="Nothing recorded yet."
              />
            </ChartCard>
          </div>
        </div>
      )}

      <DataTable<AuditRow>
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        title="Audit trail"
        searchPlaceholder="Search user, module, record type, record id..."
        emptyMessage={
          hasFilters
            ? 'No entries match these filters — widen the date range or clear them.'
            : 'Nothing has been recorded yet. Activity appears here as users work.'
        }
        exportHref={canExport ? `/api/v1/audit-log/export?${query}` : undefined}
        filters={
          <>
            <SearchableSelect
              size="sm"
              value={actorId}
              onChange={(v) => { setActorId(v); setPage(1); }}
              options={options.users.map((u) => ({ value: String(u.id), label: u.name }))}
              emptyLabel="All Users"
              placeholder="All Users"
              aria-label="User"
            />
            <SearchableSelect
              size="sm"
              value={moduleKey}
              onChange={(v) => { setModuleKey(v); setPage(1); }}
              options={options.modules.map((m) => ({ value: m, label: humanize(m) }))}
              emptyLabel="All Modules"
              placeholder="All Modules"
              aria-label="Module"
            />
            <SearchableSelect
              size="sm"
              value={action}
              onChange={(v) => { setAction(v); setPage(1); }}
              options={options.actions.map((a) => ({ value: a, label: humanize(a) }))}
              emptyLabel="All Actions"
              placeholder="All Actions"
              aria-label="Action"
            />
            {/* ISO in, ISO out — the picker needs YYYY-MM-DD (§4.19). */}
            <input
              type="date"
              className="input h-8 w-auto py-0 text-sm"
              value={from}
              max={to || undefined}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              aria-label="From date"
            />
            <input
              type="date"
              className="input h-8 w-auto py-0 text-sm"
              value={to}
              min={from || undefined}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              aria-label="To date"
            />
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="btn-secondary btn-sm">
                Clear
              </button>
            )}
          </>
        }
        columns={[
          { key: 'created_at', header: 'When', render: (r) => formatDateTime(r.created_at) },
          {
            key: 'actor_name',
            header: 'User',
            render: (r) => (
              <>
                <span className="font-medium text-foreground">
                  {r.actor_name ?? (r.actor_type === 'system' ? 'System' : '—')}
                </span>
                {r.actor_role && (
                  <span className="block text-xs text-muted-foreground">{r.actor_role}</span>
                )}
              </>
            ),
          },
          { key: 'action', header: 'Action', render: (r) => humanize(r.action) },
          { key: 'module', header: 'Module', render: (r) => (r.module ? humanize(r.module) : '—') },
          {
            key: 'entity_id',
            header: 'Record',
            render: (r) => (
              <>
                <span className="text-foreground">{r.entity_type}</span>
                <span className="block text-xs text-muted-foreground">#{r.entity_id}</span>
              </>
            ),
          },
          {
            key: 'change_count',
            header: 'Fields',
            align: 'right',
            render: (r) => (r.change_count > 0 ? String(r.change_count) : '—'),
          },
          { key: 'ip_address', header: 'IP', render: (r) => r.ip_address ?? '—' },
        ]}
        actions={(row) => ({ view: () => setDetailId(row.id) })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          search,
          onSearchChange: (q) => { setSearch(q); setPage(1); },
        }}
      />

      {detailId && <AuditDetailDialog id={detailId} onClose={() => setDetailId(null)} />}
      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
