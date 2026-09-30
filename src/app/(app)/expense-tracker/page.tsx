'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, FileSpreadsheet, Split, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import { DateRangeFilter } from '@/modules/invoice/invoiceListShared';
import { gradient } from '@/components/ui/cardGradient';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchClientOptions } from '@/lib/clientOptions';
import { formatDate } from '@/lib/formatDate';
import type { ExpenseTrackerRow } from '@/db/queries/expenseTracker';

// §4.29 — the expense tracker.
//
// One row per consignment: what it was invoiced, what has actually been paid
// out against it, and the difference. The KPI cards are aggregates over EVERY
// matching file, not a sum of the page.

interface Summary {
  paid_spend: number;
  pending_spend: number;
  invoiced: number;
  profit: number;
  margin_pct: number | null;
  incomplete: boolean;
  files: number;
}

const MODULES = [
  { value: 'all', label: 'All modules' },
  { value: 'import', label: 'Import' },
  { value: 'export', label: 'Export' },
  { value: 'local', label: 'Local' },
];

const OUTCOMES = [
  { value: 'all', label: 'All files' },
  { value: 'profit', label: 'In profit' },
  { value: 'loss', label: 'At a loss' },
  { value: 'uninvoiced', label: 'Not yet invoiced' },
];

/** Pinned to en-US so the same figure reads the same on every machine (§4.19). */
const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number): string => usd.format(n);

/** The file's own record, so a figure can be traced back to what produced it. */
const FILE_HREF: Record<string, string> = {
  import: '/imports',
  export: '/exports',
  local: '/local',
};

function Kpi({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`card bg-gradient-to-br ${gradient(color)} p-4`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-white/80">{label}</span>
        <span className="text-white/70">{icon}</span>
      </div>
      <div className="mt-2 truncate text-2xl font-bold text-white" title={value}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-white/80">{sub}</div>}
    </div>
  );
}

export default function ExpenseTrackerPage() {
  const [items, setItems] = useState<ExpenseTrackerRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [clientId, setClientId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clients, setClients] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // §4.15 — a client is labelled by its short code. `fetchClientOptions`
      // already returns ready-to-render `{ value, label }`, so nothing here
      // re-derives the label.
      const rows = await fetchClientOptions();
      if (!cancelled) setClients(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Every filter, in one place — the list and the export read the same set. */
  const query = useMemo(() => {
    const p = new URLSearchParams({ module, outcome, page: String(page), pageSize: String(pageSize) });
    if (search.trim()) p.set('q', search.trim());
    if (clientId) p.set('client_id', clientId);
    if (dateFrom) p.set('from', dateFrom);
    if (dateTo) p.set('to', dateTo);
    return p;
  }, [module, outcome, page, pageSize, search, clientId, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await safeFetchJson<ExpenseTrackerRow[]>(`/api/v1/expense-tracker?${query}`);
    if (res.ok) {
      setItems(res.data);
      const meta = res.meta as { total?: number; summary?: Summary } | undefined;
      setTotal(meta?.total ?? 0);
      setSummary(meta?.summary ?? null);
      setError(null);
    } else {
      // A failed load must not render as an empty table — "no files" and "the
      // server did not answer" look identical otherwise.
      setItems([]);
      setTotal(0);
      setSummary(null);
      setError(res.message || 'The expense tracker could not be loaded.');
    }
    setLoading(false);
  }, [query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  /** Any filter change starts a fresh page — page 4 of a new filter is nothing. */
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-foreground">Expense Tracker</h1>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Invoiced"
            value={`$${money(summary.invoiced)}`}
            sub={`${summary.files} file${summary.files === 1 ? '' : 's'}`}
            color="sky"
            icon={<FileSpreadsheet className="h-4 w-4" />}
          />
          <Kpi
            label="Paid Out"
            value={`$${money(summary.paid_spend)}`}
            sub={`$${money(summary.pending_spend)} still to pay`}
            color="rose"
            icon={<Wallet className="h-4 w-4" />}
          />
          <Kpi
            label="Profit"
            value={`$${money(summary.profit)}`}
            sub={summary.margin_pct === null ? 'Nothing invoiced yet' : `${summary.margin_pct}% margin`}
            color={summary.profit < 0 ? 'rose' : 'teal'}
            icon={summary.profit < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
          />
          <Kpi
            label="Committed"
            value={`$${money(summary.paid_spend + summary.pending_spend)}`}
            sub="Paid plus awaiting payment"
            color="amber"
            icon={<Wallet className="h-4 w-4" />}
          />
        </div>
      )}

      {/* Says so when a figure is knowingly incomplete, rather than letting a
          confident-looking number stand (§4.23 applied to a number). */}
      {summary?.incomplete && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Some payment requests are in a currency other than USD. They are counted but not
            converted — no exchange rate is applied — so spend is understated on the rows marked
            below, and profit on those rows is higher than it should be.
          </p>
        </div>
      )}

      <DataTable<ExpenseTrackerRow>
        rows={items}
        loading={loading}
        rowKey={(r) => `${r.module}-${r.file_id}`}
        searchPlaceholder="Search MCA reference, client..."
        emptyMessage="No files match these filters — widen the date range or clear the module filter."
        exportHref={`/api/v1/expense-tracker/export?${query}`}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <SearchableSelect size="sm" className="w-36" value={module} onChange={reset(setModule)} options={MODULES} aria-label="Module" />
            <SearchableSelect size="sm" className="w-44" value={outcome} onChange={reset(setOutcome)} options={OUTCOMES} aria-label="Outcome" />
            <SearchableSelect
              size="sm"
              className="w-40"
              value={clientId}
              onChange={reset(setClientId)}
              options={clients}
              emptyLabel="All Clients"
              placeholder="All Clients"
              aria-label="Client"
            />
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => {
                setDateFrom(f);
                setDateTo(t);
                setPage(1);
              }}
            />
          </div>
        }
        columns={[
          {
            key: 'mca_ref',
            header: 'MCA Reference',
            sortable: true,
            className: 'font-mono',
            // Links to the file, so a figure can be traced to what produced it.
            render: (r) => (
              <Link href={`${FILE_HREF[r.module]}/${r.file_id}`} className="hover:underline">
                {r.mca_ref}
              </Link>
            ),
          },
          {
            key: 'module',
            header: 'Module',
            sortable: true,
            render: (r) => <span className="capitalize">{r.module}</span>,
          },
          { key: 'client_name', header: 'Client', sortable: true },
          { key: 'clearing_status', header: 'Clearing Status', badge: true },
          {
            key: 'file_date',
            header: 'File Date',
            sortable: true,
            // §4.19 — a column whose key names a date needs a render.
            render: (r) => formatDate(r.file_date),
          },
          {
            key: 'invoiced',
            header: 'Invoiced',
            align: 'right' as const,
            sortable: true,
            className: 'font-mono tabular-nums',
            render: (r) => (
              <span className="inline-flex items-center justify-end gap-1">
                {money(r.invoiced)}
                {/* An equal share is never left to look like a direct bill. */}
                {/* An equal share must never be mistaken for a direct bill.
                    The title sits on a span because a lucide icon takes no
                    `title` prop. */}
                {r.shared_invoice && (
                  <span title="This invoice also covers other files — an equal share is shown">
                    <Split className="h-3 w-3 text-muted-foreground" aria-label="Shared invoice" />
                  </span>
                )}
              </span>
            ),
          },
          {
            key: 'paid_spend',
            header: 'Paid Out',
            align: 'right' as const,
            sortable: true,
            className: 'font-mono tabular-nums',
            render: (r) => money(r.paid_spend),
          },
          {
            key: 'pending_spend',
            header: 'Pending',
            align: 'right' as const,
            sortable: true,
            className: 'font-mono tabular-nums text-muted-foreground',
            render: (r) => (r.pending_spend ? money(r.pending_spend) : '—'),
          },
          {
            key: 'profit',
            header: 'Profit',
            align: 'right' as const,
            sortable: true,
            className: 'font-mono tabular-nums',
            render: (r) => (
              <span
                className={`font-semibold ${
                  r.profit < 0
                    ? 'text-red-700 dark:text-red-300'
                    : r.profit > 0
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-muted-foreground'
                }`}
                title={
                  r.incomplete
                    ? `Understated — ${r.other_currency_spend_count} request(s) in another currency are not included`
                    : undefined
                }
              >
                {money(r.profit)}
                {r.incomplete && ' *'}
              </span>
            ),
          },
          {
            key: 'margin_pct',
            header: 'Margin',
            align: 'right' as const,
            sortable: true,
            className: 'font-mono tabular-nums',
            render: (r) =>
              r.margin_pct === null ? (
                <StatusBadge status="Not invoiced" />
              ) : (
                `${r.margin_pct}%`
              ),
          },
        ]}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => {
            setPageSize(n);
            setPage(1);
          },
          search,
          onSearchChange: reset(setSearch),
        }}
      />
    </>
  );
}
