'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  History,
  LogIn,
  Pencil,
  RotateCcw,
  Trash2,
  CalendarDays,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatCard from '@/components/ui/StatCard';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDateTime } from '@/lib/formatDate';
import AuditDetailDialog from './AuditDetailDialog';
import AuditTrend from './AuditTrend';

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

interface AuditStats {
  total: number;
  today: number;
  data_changes: number;
  logins: number;
  deletes: number;
  restores: number;
  by_action: Array<{ key: string; count: number }>;
  by_module: Array<{ key: string; count: number }>;
  by_user: Array<{ key: string; count: number }>;
  by_day: Array<{ key: string; count: number }>;
}

interface FilterOptions {
  modules: string[];
  actions: string[];
  users: Array<{ id: number; name: string }>;
}

const EMPTY_OPTIONS: FilterOptions = { modules: [], actions: [], users: [] };

function humanize(value: string): string {
  return value.replace(/[_-]/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase());
}

/** DD-MM for the daily strip — the year is implied by the 30-day window (§4.19). */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}-${m}` : iso;
}

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

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard icon={<Activity className="h-5 w-5" />} label="Entries" value={stats?.total ?? 0} />
        <StatCard icon={<CalendarDays className="h-5 w-5" />} label="Today" value={stats?.today ?? 0} />
        <StatCard
          icon={<Pencil className="h-5 w-5" />}
          label="Data Changes"
          value={stats?.data_changes ?? 0}
          onClick={() => filterByAction('update')}
          active={action === 'update'}
          title="Show updates"
        />
        <StatCard
          icon={<LogIn className="h-5 w-5" />}
          label="Sign-ins"
          value={stats?.logins ?? 0}
          onClick={() => filterByAction('login')}
          active={action === 'login'}
          title="Show sign-ins"
        />
        <StatCard
          icon={<Trash2 className="h-5 w-5" />}
          label="Deletions"
          value={stats?.deletes ?? 0}
          onClick={() => filterByAction('delete')}
          active={action === 'delete'}
          title="Show deletions"
        />
        <StatCard
          icon={<RotateCcw className="h-5 w-5" />}
          label="Restores"
          value={stats?.restores ?? 0}
          onClick={() => filterByAction('restore')}
          active={action === 'restore'}
          title="Show restores"
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <AuditTrend
          title="Activity — last 30 days"
          data={stats?.by_day ?? []}
          formatKey={dayLabel}
          emptyMessage="No activity in this range."
        />
        <AuditTrend
          title="By module"
          data={stats?.by_module.slice(0, 8) ?? []}
          formatKey={humanize}
          emptyMessage="Nothing recorded yet."
        />
        <AuditTrend
          title="Most active users"
          data={stats?.by_user.slice(0, 8) ?? []}
          emptyMessage="Nothing recorded yet."
        />
      </div>

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
