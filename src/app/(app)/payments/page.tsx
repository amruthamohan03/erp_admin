'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarOff,
  Check,
  Copy,
  Eye,
  Filter,
  Plus,
  Printer,
  RotateCcw,
  Wallet,
  X,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import RecordViewModal from '@/components/transactional/RecordViewModal';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import ApprovalTrail from '@/modules/payments/ApprovalTrail';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions, type SelectOption } from '@/lib/selectOptions';
import { fetchClientOptions } from '@/lib/clientOptions';
// From the leaf module, never the `@/schemas` barrel: that barrel reaches
// `next/headers` through bulk-update → recordAudit, which a client component
// cannot import (it is a build error, not a runtime one).
import { defaultPaymentDateRange } from '@/lib/payments/dateRange';
import {
  PAY_FOR_LABELS,
  canEditRequest,
  paymentStatus,
  willResubmitOnSave,
  type PaymentStatusKey,
  type PaymentApprovalState,
} from '@/lib/payments/stages';
import type { PaymentStage } from '@/db/schema';

// Payment Request — the multi-stage approval list (§2 step 6). The form
// (create/edit) is a transaction page (/payments/new, /payments/[id]); this
// screen owns the stat-card filters, the server-side list, the date-range
// export, and the approve / reject / re-submit actions.
//
// Every derived rule it renders — the status badge, whether Edit is offered,
// whether a request can go round again — comes from `lib/payments/stages`, which
// the API routes use too. They were duplicated here before, so the grid could
// offer an Edit the server would refuse (§4.10, §4.37).

interface Row extends PaymentApprovalState {
  id: number;
  requestee: string;
  beneficiary: string | null;
  client_name: string | null;
  pay_for: number | null;
  currency_short_name: string | null;
  expense_type_name: string | null;
  amount: string;
  mca_count: number;
  created_at: string;
  created_by: number | null;
  resubmit_count: number;
  department_name: string | null;
  location_name: string | null;
}

/** A reference line as the detail endpoint returns it. */
interface McaLine {
  mca_ref: string;
  amount: number;
}

const CARDS: Array<{ key: string; label: string; grad: string }> = [
  { key: 'all', label: 'Total', grad: 'from-indigo-500 to-violet-600' },
  { key: 'waiting_dept', label: 'Pending Dept', grad: 'from-amber-500 to-orange-500' },
  { key: 'waiting_finance', label: 'Pending Finance', grad: 'from-cyan-500 to-sky-600' },
  { key: 'waiting_mgmt', label: 'Pending Mgmt', grad: 'from-violet-500 to-purple-600' },
  { key: 'waiting_under_process', label: 'Under Process', grad: 'from-sky-500 to-blue-600' },
  { key: 'waiting_payment', label: 'Pending Payment', grad: 'from-orange-500 to-amber-600' },
  { key: 'paid', label: 'Paid', grad: 'from-emerald-500 to-teal-600' },
  { key: 'rejected', label: 'Rejected', grad: 'from-rose-500 to-red-600' },
];

/** §4.32 — the badge hue per derived status, both themes stated. */
const STATUS_CLASS: Record<PaymentStatusKey, string> = {
  rejected: 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
  paid: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  waiting_dept: 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  waiting_finance: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
  waiting_mgmt: 'bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300 border-violet-200 dark:border-violet-500/30',
  waiting_under_process: 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-500/30',
  waiting_payment: 'bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-500/30',
};

function fmt(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? Number(v) : v ?? 0;
  return (Number.isFinite(n) ? (n as number) : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * The same amount with NO thousands separators — for the clipboard, not the eye.
 *
 * `1,696.19` pasted into a spreadsheet cell is text; `1696.19` is a number the
 * receiving sheet can total. Copying is done to work with the figures, so the
 * separators that help someone read them are exactly wrong here.
 */
function fmtPlain(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? Number(v) : v ?? 0;
  return (Number.isFinite(n) ? (n as number) : 0).toFixed(2);
}

/** The filters that are not the status cards, kept together so one reset clears them. */
interface Filters {
  from: string;
  to: string;
  client_id: string;
  department: string;
  location_id: string;
  pay_for: string;
  payment_type: string;
  currency: string;
  expense_type: string;
}

/**
 * The opening view: this year so far, nothing else narrowed.
 *
 * A payment request is settled within a financial year, so "1 January → today"
 * is what somebody opening the screen is looking for, and an unbounded list gets
 * slower every year while showing more rows nobody wants. `defaultPaymentDateRange`
 * is the server's own default, imported rather than re-derived so the grid's
 * opening state and an API call with no dates select the same rows (§4.10).
 */
function initialFilters(): Filters {
  const range = defaultPaymentDateRange();
  return {
    from: range.from,
    to: range.to,
    client_id: '',
    department: '',
    location_id: '',
    pay_for: '',
    payment_type: '',
    currency: '',
    expense_type: '',
  };
}

export default function PaymentsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  /**
   * Empty until mounted, then seeded with this year's range.
   *
   * `defaultPaymentDateRange()` reads the LOCAL calendar day, so evaluating it
   * during render answers with the server's day on the server and the browser's
   * during hydration — different strings whenever the two are in different
   * timezones, which is a hydration mismatch on both date inputs. Nothing loads
   * until the client owns the render, so there is no flash of unfiltered rows.
   */
  const [filters, setFilters] = useState<Filters>(() => ({
    from: '',
    to: '',
    client_id: '',
    department: '',
    location_id: '',
    pay_for: '',
    payment_type: '',
    currency: '',
    expense_type: '',
  }));
  const [mounted, setMounted] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [perms, setPerms] = useState<{ stages: PaymentStage[] }>({ stages: [] });

  // Options for the filter bar. Fetched once; a dropdown that cannot load comes
  // back empty rather than throwing through the bar's render.
  const [clients, setClients] = useState<SelectOption[]>([]);
  const [departments, setDepartments] = useState<SelectOption[]>([]);
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [currencies, setCurrencies] = useState<SelectOption[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<SelectOption[]>([]);
  /** Who is looking — only the requester may edit their own request. */
  const [userId, setUserId] = useState<number | null>(null);

  /**
   * The request whose detail is open, and the detail itself.
   *
   * `viewMode` decides which reading of it is shown: the whole record, or just
   * its references. Both need the same fetch, so they share one — the references
   * are a JSONB column on the request, not a separate resource.
   */
  const [viewId, setViewId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'record' | 'refs'>('record');
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const [act, setAct] = useState<{ row: Row; stage: PaymentStage } | null>(null);
  const [reason, setReason] = useState('');
  const [cashCollector, setCashCollector] = useState('');
  /** Department approval may attach a chargeback; blank means none. */
  const [chargeback, setChargeback] = useState('');
  const [busy, setBusy] = useState(false);

  // §4.22 — every create/update/delete ends in an acknowledged dialog.
  const [result, setResult] = useState<SaveResult | null>(null);

  /** The filters as a query string — one builder, so the grid, the cards and the export agree. */
  const query = useCallback(
    (extra?: Record<string, string>): URLSearchParams => {
      const p = new URLSearchParams({ status_filter: statusFilter, ...(extra ?? {}) });
      if (search.trim()) p.set('q', search.trim());
      for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
      // Both dates deliberately cleared. Without this the server would fill in
      // its default range and "show every year" would be impossible to ask for —
      // an absent filter and a cleared one look identical in a query string.
      if (!filters.from && !filters.to) p.set('all_dates', '1');
      return p;
    },
    [statusFilter, search, filters],
  );

  const load = useCallback(async () => {
    if (!mounted) return; // see `filters` — nothing fetches before the clock is the browser's
    setLoading(true);
    try {
      const res = await safeFetchJson<Row[]>(
        `/api/v1/payments?${query({ page: String(page), pageSize: String(pageSize) })}`,
      );
      if (!res.ok) {
        setResult({ status: 'error', title: 'Not loaded', message: res.message });
        return;
      }
      setItems(res.data);
      setTotal(Number(res.meta?.total ?? 0));
    } finally {
      setLoading(false);
    }
  }, [mounted, query, page, pageSize]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // The cards count the SAME rows the grid is showing, so they take the same
  // filters — minus the status bucket, which is what each card counts.
  const loadCounts = useCallback(async () => {
    if (!mounted) return;
    const res = await safeFetchJson<Record<string, number>>(
      `/api/v1/payments/status-counts?${query()}`,
    );
    if (res.ok) setCounts(res.data);
  }, [mounted, query]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadCounts(); }, [loadCounts]);

  // The browser's calendar year, read once it owns the render.
  useEffect(() => {
    const range = defaultPaymentDateRange();
    /* eslint-disable react-hooks/set-state-in-effect */
    setFilters((prev) => ({ ...prev, from: range.from, to: range.to }));
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // The filter bar's options and this role's actionable stages — fetched once,
  // never refetched, so they are not part of `load`.
  useEffect(() => {
    void (async () => {
      const res = await safeFetchJson<{ stages: PaymentStage[]; user_id: number }>(
        '/api/v1/payments/permissions',
      );
      if (res.ok) {
        setPerms({ stages: res.data.stages });
        setUserId(res.data.user_id);
      }
      const opt = (rows: { id: number; label: string }[]): SelectOption[] =>
        rows.map((r) => ({ value: String(r.id), label: r.label }));
      const [cl, dept, loc, cur, exp] = await Promise.all([
        fetchClientOptions(),
        fetchMasterOptions('departments', 'department_name'),
        fetchMasterOptions('main-offices', 'main_location_name'),
        fetchMasterOptions('currencies', 'currency_short_name'),
        fetchMasterOptions('expense-types', 'expense_type_name'),
      ]);
      setClients(cl);
      setDepartments(opt(dept));
      setLocations(opt(loc));
      setCurrencies(opt(cur));
      setExpenseTypes(opt(exp));
    })();
  }, []);

  /** Open a request's detail — both readings share the fetch. */
  const openDetail = useCallback(async (id: number, mode: 'record' | 'refs') => {
    setDetail(null);
    setViewId(id);
    setViewMode(mode);
    const res = await safeFetchJson<Record<string, unknown>>(`/api/v1/payments/${id}`);
    if (!res.ok) {
      setViewId(null);
      setResult({ status: 'error', title: 'Not loaded', message: res.message });
      return;
    }
    setDetail(res.data);
  }, []);

  function closeDetail(): void {
    setViewId(null);
    setDetail(null);
  }

  /**
   * Put text on the clipboard and say so.
   *
   * The confirmation is the point: a copy button gives no feedback of its own,
   * so without one the operator cannot tell a successful copy from a silent
   * failure until they paste. `navigator.clipboard` is unavailable on an
   * insecure origin and can be refused by permissions, and BOTH show up as a
   * rejected promise rather than a throw — so the failure is reported rather
   * than swallowed (§4.22, §4.23).
   */
  async function copyToClipboard(text: string, done: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setResult({ status: 'success', title: 'Copied', message: done });
    } catch {
      setResult({
        status: 'error',
        title: 'Not copied',
        message:
          'The browser refused clipboard access. Select the references in the table and copy them with Ctrl+C.',
      });
    }
  }

  async function submitApprove(): Promise<void> {
    if (!act) return;
    setBusy(true);
    try {
      const res = await safeFetchJson<{ stage_label: string }>(
        `/api/v1/payments/${act.row.id}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stage: act.stage,
            cash_collector: cashCollector || undefined,
            // Department approval is where a chargeback is decided. Blank means
            // none — not zero, which would read as "charged back nothing".
            chargeback: act.stage === 'dept' && chargeback.trim() !== '' ? chargeback : undefined,
          }),
        },
      );
      if (!res.ok) {
        setResult({ status: 'error', title: 'Not approved', message: res.message });
        return;
      }
      setAct(null);
      setResult({
        status: 'success',
        title: 'Approved',
        message: `Request #${act.row.id} has been approved at ${res.data.stage_label}.`,
      });
      void load();
      void loadCounts();
    } finally {
      setBusy(false);
    }
  }

  async function submitReject(): Promise<void> {
    if (!act) return;
    if (!reason.trim()) {
      setResult({
        status: 'error',
        title: 'Not rejected',
        message: 'A rejection reason is required — it is what the requester has to work from.',
      });
      return;
    }
    setBusy(true);
    try {
      const res = await safeFetchJson<{ stage_label: string }>(
        `/api/v1/payments/${act.row.id}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: act.stage, reason: reason.trim() }),
        },
      );
      if (!res.ok) {
        setResult({ status: 'error', title: 'Not rejected', message: res.message });
        return;
      }
      setAct(null);
      setResult({
        status: 'success',
        title: 'Rejected',
        message: `Request #${act.row.id} has been rejected at ${res.data.stage_label} and sent back to be corrected.`,
      });
      void load();
      void loadCounts();
    } finally {
      setBusy(false);
    }
  }

  const canStage = useMemo(() => new Set(perms.stages), [perms.stages]);

  /**
   * How many filters differ from the opening view.
   *
   * The default date range is the default VIEW, not a filter somebody applied,
   * so counting it would open the screen already claiming two active filters —
   * and a badge that is never zero stops meaning anything. A range the operator
   * changed, or cleared, does count.
   */
  const activeFilters = useMemo(() => {
    const base = defaultPaymentDateRange();
    return Object.entries(filters).filter(([k, v]) => {
      if (k === 'from') return v !== base.from;
      if (k === 'to') return v !== base.to;
      return v !== '';
    }).length;
  }, [filters]);
  const exportHref = `/api/v1/payments/export?${query()}`;
  const refLines = (detail?.mca_data as McaLine[] | undefined) ?? [];

  /** Every filter control resets to page 1 — a fresh narrowing starts at the top. */
  function setFilter<K extends keyof Filters>(key: K, value: string): void {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  /**
   * The seven column filters, as data.
   *
   * Declared rather than written out seven times so they cannot drift in label
   * casing, empty-row wording or size — the same reason `<DataTable>` takes its
   * columns as descriptors (§4.25).
   */
  const columnFilters: Array<{ key: keyof Filters; label: string; options: SelectOption[] }> = [
    { key: 'department', label: 'Department', options: departments },
    { key: 'location_id', label: 'Location', options: locations },
    // §4.15 — clients are labelled by their short code, here as everywhere.
    { key: 'client_id', label: 'Client', options: clients },
    {
      key: 'pay_for',
      label: 'Payment For',
      options: PAY_FOR_LABELS.map((label, i) => ({ value: String(i), label })),
    },
    {
      key: 'payment_type',
      label: 'Payment Type',
      options: [
        { value: 'Bank', label: 'Bank' },
        { value: 'Cash', label: 'Cash' },
      ],
    },
    { key: 'currency', label: 'Currency', options: currencies },
    { key: 'expense_type', label: 'Expense Type', options: expenseTypes },
  ];

  return (
    <>
      <div className="card overflow-hidden mb-4">
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600" />
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary-600" /> Payment Requests
          </h1>
        </div>
      </div>

      {/* Stat cards / status filter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 mb-4">
        {CARDS.map((card) => {
          const value = card.key === 'all' ? (counts.total ?? 0) : (counts[card.key] ?? 0);
          const active = statusFilter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => { setStatusFilter(card.key); setPage(1); }}
              className={`text-left rounded-xl bg-gradient-to-br ${card.grad} text-white p-3 shadow-sm transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-foreground/40' : ''}`}
            >
              <div className="text-2xl font-bold leading-none">{value}</div>
              <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">{card.label}</div>
            </button>
          );
        })}
      </div>

      {/* ---- Column filters ---------------------------------------------
          Always visible, above the list, rather than behind a toggle. The
          operator needs to SEE what is narrowing the grid: the date range in
          particular defaults to this year, so a hidden panel would mean a list
          that silently omits last year's requests with nothing on screen
          saying so. The red control clears everything back to that default. */}
      <div className="card mb-4 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Column Filters
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {filters.from || filters.to
              ? `Requests raised ${filters.from ? formatDate(filters.from) : 'any time'} — ${filters.to ? formatDate(filters.to) : 'today'}`
              : 'Requests raised on any date'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
          <div>
            <label htmlFor="pay-from" className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              From
            </label>
            <input
              id="pay-from"
              type="date"
              className="input min-w-0 w-full h-8 text-xs"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilter('from', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="pay-to" className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              To
            </label>
            <input
              id="pay-to"
              type="date"
              className="input min-w-0 w-full h-8 text-xs"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilter('to', e.target.value)}
            />
          </div>

          {columnFilters.map((f) => (
            <div key={f.key}>
              <label className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" title={f.label}>
                {f.label}
              </label>
              {/* §4.16 — a searchable dropdown, never a raw <select>. */}
              <SearchableSelect
                size="sm"
                value={filters[f.key]}
                onChange={(v) => setFilter(f.key, v)}
                options={f.options}
                emptyLabel="All"
                placeholder="All"
                aria-label={f.label}
              />
            </div>
          ))}

          {/* Last cell, aligned to the controls' baseline rather than their labels. */}
          <div className="flex items-end gap-1">
            <button
              type="button"
              onClick={() => { setFilters(initialFilters()); setPage(1); }}
              disabled={activeFilters === 0}
              title="Reset every filter, back to this year"
              aria-label="Reset every filter"
              className="btn-danger btn-icon relative h-8 w-8 shrink-0 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
              {activeFilters > 0 && (
                <span className="absolute -end-1 -top-1 rounded-full bg-foreground px-1 text-[9px] font-bold leading-4 text-background">
                  {activeFilters}
                </span>
              )}
            </button>
            {/* Separate from Reset: clearing the DATES widens the list to every
                year, which is a different intent from putting the filters back
                to how the screen opened. */}
            <button
              type="button"
              onClick={() => { setFilters((p) => ({ ...p, from: '', to: '' })); setPage(1); }}
              disabled={!filters.from && !filters.to}
              title="Show requests from every year, not just this one"
              aria-label="Clear the date range"
              className="btn-neutral btn-icon h-8 w-8 shrink-0 disabled:opacity-40"
            >
              <CalendarOff className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* serial={false}: the request number IS the reference operators quote,
          so it stands in for the running serial rather than sitting beside it. */}
      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        title="List of Payment Requests"
        searchPlaceholder="Search #, requestee, beneficiary, client, amount, date…"
        emptyMessage={
          activeFilters > 0 || statusFilter !== 'all'
            ? 'No requests match these filters — widen the date range or clear them.'
            : 'No payment requests yet — raise the first one.'
        }
        serial={false}
        // The export carries the SAME filters the grid is showing, date range
        // included, so the sheet contains the rows on screen (§4.15).
        exportHref={exportHref}
        toolbar={
          // §4.35 — the create action belongs to the list it adds to, not to the
          // page header, and it goes last so it ends the row.
          <Link href="/payments/new" className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Payment Request
          </Link>
        }
        columns={[
          { key: 'id', header: '#', className: 'font-mono font-semibold', render: (r) => `#${r.id}` },
          { key: 'requestee', header: 'Requestee', sortable: true, className: 'font-medium' },
          { key: 'beneficiary', header: 'Beneficiary', sortable: true },
          // §4.15 — the Client column is the short code, and the endpoint
          // searches both spellings so typing what is shown finds the row.
          { key: 'client_name', header: 'Client', sortable: true },
          {
            key: 'pay_for',
            header: 'For',
            render: (r) => (r.pay_for != null ? PAY_FOR_LABELS[r.pay_for] ?? '—' : '—'),
          },
          { key: 'payment_type', header: 'Type', sortable: true },
          { key: 'currency_short_name', header: 'Currency' },
          { key: 'expense_type_name', header: 'Expense', className: 'max-w-[10rem] truncate' },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            sortable: true,
            className: 'tabular-nums font-semibold',
            render: (r) => fmt(r.amount),
          },
          {
            key: 'mca_count',
            header: 'Refs',
            align: 'center',
            value: (r) => r.mca_count,
            // The count alone said how many references there were and gave no way
            // to see WHICH — the one thing somebody checking a request wants from
            // this column. The number now opens them.
            //
            // Rendered even at zero, deliberately: a column that is sometimes a
            // button and sometimes plain text is scanned as two different things,
            // and "this request carries no references" is itself an answer worth
            // being able to ask for.
            render: (r) => (
              <button
                type="button"
                onClick={() => void openDetail(r.id, 'refs')}
                title={
                  r.mca_count > 0
                    ? `View the ${r.mca_count} reference${r.mca_count === 1 ? '' : 's'} on request #${r.id}`
                    : `Request #${r.id} carries no references`
                }
                className="btn-view btn-sm h-7 gap-1 px-2 text-[11px]"
              >
                <Eye className="h-3.5 w-3.5" />
                {r.mca_count}
              </button>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            value: (r) => paymentStatus(r).label,
            render: (r) => {
              const st = paymentStatus(r);
              return (
                <span className="inline-flex items-center gap-1">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[st.key]}`}
                    // Says what Edit will do to a rejected row, where the
                    // operator is already looking to find out why it stopped.
                    title={
                      willResubmitOnSave(r)
                        ? 'Rejected — correcting this request and saving it sends it back to Department for approval.'
                        : undefined
                    }
                  >
                    {st.label}
                  </span>
                  {r.resubmit_count > 0 && (
                    <span
                      title={`Sent back and re-submitted ${r.resubmit_count} time${r.resubmit_count === 1 ? '' : 's'}`}
                      className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                    >
                      <RotateCcw className="h-2.5 w-2.5" />
                      {r.resubmit_count}
                    </span>
                  )}
                </span>
              );
            },
          },
          {
            key: 'created_at',
            header: 'Date',
            sortable: true,
            // §4.19 — and the tooltip carries the time, which is what a request
            // raised twice on the same day is told apart by.
            render: (r) => <span title={formatDateTime(r.created_at, '')}>{formatDate(r.created_at)}</span>,
          },
        ]}
        actions={(r) => {
          const st = paymentStatus(r);
          const canAct = st.stage != null && canStage.has(st.stage);
          // Editing is the requester's own, and only until the Department signs
          // off. A rejection hands it back, and saving the correction is what
          // sends it round again — there is no separate re-submit step.
          const editable = userId !== null && canEditRequest(r, r.created_by, userId);
          return {
            view: () => void openDetail(r.id, 'record'),
            edit: editable ? `/payments/${r.id}` : undefined,
            extra: (
              <>
                {/* The DEMANDE DE FONDS — the paper the request becomes. Opens
                    in a new tab and prints from there; it is the document the
                    approvers' signatures sit on, so it is a row action rather
                    than something buried in the viewer. */}
                <a
                  href={`/api/v1/payments/${r.id}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Print the Demande de Fonds for request #${r.id}`}
                  className="btn-pdf btn-icon ms-1"
                >
                  <Printer className="h-3.5 w-3.5" />
                </a>
                {canAct && st.stage && (
                  <button
                    type="button"
                    onClick={() => {
                      setAct({ row: r, stage: st.stage as PaymentStage });
                      setReason('');
                      setCashCollector('');
                      setChargeback('');
                    }}
                    title={`Act: ${st.label}`}
                    className="btn-approve btn-sm ms-1 h-7 px-2 text-[11px]"
                  >
                    <Check className="h-3.5 w-3.5" /> Act
                  </button>
                )}
              </>
            ),
          };
        }}
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


      {/* ---- The record, as every other module shows one ------------------ */}
      {viewId !== null && viewMode === 'record' && (
        <RecordViewModal
          slug="payment"
          entityId={viewId}
          title={`Payment Request #${viewId}`}
          // The same rule the row's Edit follows — the viewer must not offer a
          // door the save route will refuse.
          editHref={
            detail &&
            userId !== null &&
            canEditRequest(
              detail as unknown as PaymentApprovalState,
              detail.created_by as number | null,
              userId,
            )
              ? `/payments/${viewId}`
              : undefined
          }
          onClose={closeDetail}
          extra={detail ? <ApprovalTrail row={detail} /> : null}
        />
      )}

      {/* ---- The references behind the count ------------------------------ */}
      {viewId !== null && viewMode === 'refs' && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
          onClick={closeDetail}
        >
          <div className="card my-auto w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-4 text-white">
              <h2 className="flex items-center gap-2 font-semibold">
                <Eye className="h-5 w-5" /> References — Request #{viewId}
              </h2>
              <button type="button" onClick={closeDetail} className="rounded-md p-1 hover:bg-white/20" title="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">
              {!detail ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading references…</p>
              ) : refLines.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  This request carries no references.
                </p>
              ) : (
                <>
                  {/* Copying is the reason this modal is opened as often as it
                      is read: the references get pasted into a bank instruction
                      or a spreadsheet. Tab-separated, one line per reference, so
                      a paste lands in two columns rather than one. */}
                  <div className="mb-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        void copyToClipboard(
                          refLines.map((l) => `${l.mca_ref}\t${fmtPlain(l.amount)}`).join('\n'),
                          `All ${refLines.length} reference${refLines.length === 1 ? '' : 's'} copied.`,
                        )
                      }
                      className="btn-neutral btn-sm"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy All
                    </button>
                  </div>
                  <table className="table-base text-sm">
                    <thead>
                      <tr>
                        <th className="w-10">#</th>
                        <th>Reference</th>
                        <th className="text-right">Amount</th>
                        <th className="w-12 text-center">Copy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refLines.map((line, i) => (
                        <tr key={`${line.mca_ref}-${i}`}>
                          <td className="text-muted-foreground">{i + 1}</td>
                          <td className="font-mono">{line.mca_ref}</td>
                          <td className="text-right tabular-nums">{fmt(line.amount)}</td>
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={() =>
                                void copyToClipboard(
                                  `${line.mca_ref}\t${fmtPlain(line.amount)}`,
                                  `Copied ${line.mca_ref}.`,
                                )
                              }
                              title={`Copy ${line.mca_ref} and its amount`}
                              aria-label={`Copy ${line.mca_ref} and its amount`}
                              className="btn-neutral btn-icon"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold">
                        <td />
                        <td>Total</td>
                        <td className="text-right tabular-nums">
                          {fmt(refLines.reduce((s, l) => s + (Number(l.amount) || 0), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}
            </div>
            {/* §4.21 — a labelled way out, not just the X. */}
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={() => setViewMode('record')}
                className="btn-neutral btn-sm"
              >
                <Eye className="h-4 w-4" /> Full record
              </button>
              <button type="button" onClick={closeDetail} className="btn-secondary">
                <X className="h-4 w-4" /> Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Approve / reject -------------------------------------------- */}
      {act && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
          onClick={() => !busy && setAct(null)}
        >
          <div className="card my-auto w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-4 text-white">
              <h2 className="font-semibold capitalize">
                {act.stage.replace('_', ' ')} — Payment #{act.row.id}
              </h2>
              <button type="button" onClick={() => setAct(null)} className="rounded-md p-1 hover:bg-white/20" title="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div className="text-sm text-muted-foreground">
                {act.row.beneficiary} · {fmt(act.row.amount)} {act.row.currency_short_name} · {act.row.payment_type}
              </div>
              {/* Chargeback is decided at Department approval — the stage that
                  judges whether the cost belongs to a client rather than to us. */}
              {act.stage === 'dept' && (
                <div>
                  <label htmlFor="chargeback" className="label">
                    Chargeback <span className="text-muted-foreground">(leave blank for none)</span>
                  </label>
                  <input
                    id="chargeback"
                    type="number"
                    step="0.01"
                    min="0"
                    className="input w-full text-right font-mono"
                    value={chargeback}
                    onChange={(e) => setChargeback(e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    The part of {fmt(act.row.amount)} {act.row.currency_short_name} to be recovered
                    from the client.
                  </p>
                </div>
              )}
              {act.stage === 'paid' && (
                <div>
                  <label htmlFor="cash-collector" className="label required">Cash Collector</label>
                  <input
                    id="cash-collector"
                    required
                    className="input w-full"
                    value={cashCollector}
                    onChange={(e) => setCashCollector(e.target.value)}
                    placeholder="Collector name"
                  />
                </div>
              )}
              <div>
                <label htmlFor="reject-reason" className="label">
                  Rejection reason <span className="text-muted-foreground">(only if rejecting)</span>
                </label>
                <textarea
                  id="reject-reason"
                  className="input w-full"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="What has to change before this can be approved?"
                />
              </div>
            </div>
            {/* §4.21 — this modal commits an approval, so leaving without
                deciding must be an explicit, labelled choice. */}
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" onClick={() => setAct(null)} disabled={busy} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={() => void submitReject()} disabled={busy} className="btn-danger">
                <X className="h-4 w-4" /> Reject
              </button>
              <button type="button" onClick={() => void submitApprove()} disabled={busy} className="btn-primary">
                <Check className="h-4 w-4" /> {busy ? '…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
