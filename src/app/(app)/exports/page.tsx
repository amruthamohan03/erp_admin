'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Edit2,
  Filter,
  Check,
  X,
  Truck,
  Layers,
  Eye,
  FileSpreadsheet,
  FileText,
  Calendar,
  CheckCircle2,
  Loader,
  Package,
  FileCheck,
  ClipboardCheck,
  Archive,
  Receipt,
  ShieldCheck,
  Hash,
  type LucideIcon,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import RecordViewModal from '@/components/transactional/RecordViewModal';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { CLIENT_OPTION_LABEL_FIELD } from '@/lib/clientOptions';
import { fetchMasterOptions as fetchOptions, type MasterOption } from '@/lib/selectOptions';
import { formatDate } from '@/lib/formatDate';

const fmtDate = (v: unknown): string => formatDate(v, '');

// Row shape returned by /api/v1/exports (list joins). Keys mirror
// what main's /export list renders (client_name, license_number,
// clearing_status_name, …).
interface ExportRow {
  id: number;
  mca_ref: string | null;
  invoice: string | null;
  client_name: string | null;
  license_number: string | null;
  loading_date: string | null;
  weight: string | null;
  fob: string | null;
  clearing_status_name: string | null;
}

type Option = MasterOption;

interface Stats {
  total_count: number;
  total_fob: number;
  total_weight: number;
  this_month_count: number;
  // status-filter counts keyed by ExportFilterKey (e.g. seal_pending)
  [key: string]: number;
}

// §8 — the export tracking status cards (mirrors the legacy Export Management
// dashboard). `total` clears all filters; the rest are AND-combined status
// filters whose counts + grid predicates come from the shared builder.
const STATUS_CARDS: Array<{ key: string; label: string; grad: string; Icon: LucideIcon }> = [
  { key: 'total', label: 'Total Exports', grad: 'from-blue-500 to-blue-600', Icon: FileText },
  { key: 'lmc_id_pending', label: 'LMC ID Pending', grad: 'from-sky-500 to-blue-600', Icon: Hash },
  { key: 'completed', label: 'Completed', grad: 'from-emerald-500 to-green-600', Icon: CheckCircle2 },
  { key: 'lmc_date_pending', label: 'LMC Date Pending', grad: 'from-slate-500 to-slate-600', Icon: Calendar },
  { key: 'in_progress', label: 'In Progress', grad: 'from-amber-500 to-orange-500', Icon: Loader },
  { key: 'ogefrem_ref_pending', label: 'OGEFREM Inv.Ref Pending', grad: 'from-amber-700 to-yellow-700', Icon: FileText },
  { key: 'ogefrem_date_pending', label: 'OGEFREM Date Pending', grad: 'from-red-500 to-rose-600', Icon: Calendar },
  { key: 'in_transit', label: 'In Transit', grad: 'from-slate-400 to-slate-500', Icon: Package },
  { key: 'ceec_pending', label: 'CEEC Pending', grad: 'from-teal-500 to-teal-600', Icon: FileCheck },
  { key: 'min_div_pending', label: 'Min Div Pending', grad: 'from-rose-500 to-red-600', Icon: FileCheck },
  { key: 'gov_docs_pending', label: 'Gov Docs Pending', grad: 'from-pink-500 to-pink-600', Icon: FileText },
  { key: 'audited_pending', label: 'Audited Pending', grad: 'from-violet-500 to-purple-600', Icon: ClipboardCheck },
  { key: 'archived_pending', label: 'Archived Pending', grad: 'from-emerald-500 to-teal-600', Icon: Archive },
  { key: 'dgda_in_pending', label: 'DGDA In Pending', grad: 'from-red-500 to-rose-600', Icon: FileText },
  { key: 'liquidation_pending', label: 'Liquidation Pending', grad: 'from-slate-500 to-slate-700', Icon: Receipt },
  { key: 'quittance_pending', label: 'Quittance Pending', grad: 'from-cyan-500 to-teal-600', Icon: Receipt },
  { key: 'dispatch_pending', label: 'Dispatch Pending', grad: 'from-amber-500 to-orange-600', Icon: Truck },
  { key: 'seal_pending', label: 'Seal Pending', grad: 'from-emerald-600 to-green-700', Icon: ShieldCheck },
];

interface FilterState {
  client_id: string;
  transport_mode_id: string;
  loading_from: string;
  loading_to: string;
}
const EMPTY_FILTERS: FilterState = {
  client_id: '',
  transport_mode_id: '',
  loading_from: '',
  loading_to: '',
};

const CARD_GRADIENT = 'from-indigo-500 to-purple-600';

function fmtCount(n: number): string {
  return n.toLocaleString();
}
function fmtNum(v: string | null | undefined): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : String(v);
}



export default function ExportsListPage() {
  const [items, setItems] = useState<ExportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientOpts, setClientOpts] = useState<Option[]>([]);
  const [transportOpts, setTransportOpts] = useState<Option[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  // §8 — status cards clicked, AND-combined. Empty ⇒ "Total" (all rows).
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  // View-details modal (per-row eye action) — null when closed, else row id.
  const [viewId, setViewId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, t, s] = await Promise.all([
        // Clients are labelled by short code app-wide (§4.15).
        fetchOptions('clients', CLIENT_OPTION_LABEL_FIELD),
        fetchOptions('transport-modes', 'transport_mode_name'),
        fetch('/api/v1/exports/stats').then((res) => res.json()),
      ]);
      if (cancelled) return;
      setClientOpts(c);
      setTransportOpts(t);
      if (s.ok) setStats(s.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Shared query string: server pagination + applied advanced filters.
  const buildParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    Object.entries(applied).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    if (activeFilters.length) params.set('status_filters', activeFilters.join(','));
    return params;
  }, [search, applied, activeFilters]);

  function toggleCard(key: string): void {
    setPage(1);
    if (key === 'total') {
      setActiveFilters([]);
      return;
    }
    setActiveFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const res = await fetch(`/api/v1/exports?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
        setError(null);
      } else {
        setError(json.error?.message ?? 'Failed to load');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [buildParams, page, pageSize]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const hasActiveFilters = Object.values(applied).some(Boolean);

  function applyFilters(): void {
    if (
      draft.loading_from &&
      draft.loading_to &&
      draft.loading_from > draft.loading_to
    ) {
      return;
    }
    setApplied(draft);
    setPage(1);
  }
  function clearFilters(): void {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  return (
    <>
      {/* ---- Header ---- */}
      <div className="card p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary-600" /> Export Management
        </h1>
        <a
          href={`/api/v1/exports/export?${buildParams().toString()}`}
          title="Excel — flat list (respects filters)"
          className="btn-excel btn-sm"
        >
          <FileSpreadsheet className="h-4 w-4" /> Export ALL to Excel
        </a>
      </div>

      {/* ---- Status cards (clickable filters) ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-4">
        {STATUS_CARDS.map((card) => {
          const active =
            card.key === 'total'
              ? activeFilters.length === 0
              : activeFilters.includes(card.key);
          const value = stats ? (stats[card.key] ?? 0) : 0;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => toggleCard(card.key)}
              title={`Filter: ${card.label}`}
              className={`relative text-left rounded-xl bg-gradient-to-br ${card.grad} text-white p-3 shadow-sm transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-foreground/40' : ''}`}
            >
              <div className="absolute right-2 top-2">
                {active ? (
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-card text-foreground shadow">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                ) : (
                  <card.Icon className="h-5 w-5 opacity-30" />
                )}
              </div>
              <div className="text-2xl font-bold leading-none">{stats ? fmtCount(value) : '—'}</div>
              <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">{card.label}</div>
            </button>
          );
        })}
      </div>

      {/* ---- Advanced Filters ---- */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
          <Filter className="h-4 w-4 text-primary-600" />
          <span className="font-semibold text-foreground">Advanced Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="label">Filter by Clients</label>
            <SearchableSelect
              value={draft.client_id}
              onChange={(v) => setDraft((d) => ({ ...d, client_id: v }))}
              options={clientOpts.map((o) => ({
                value: String(o.id),
                label: o.label,
              }))}
              placeholder="All Clients"
              emptyLabel="All Clients"
            />
          </div>
          <div>
            <label className="label">Transport Mode</label>
            <SearchableSelect
              value={draft.transport_mode_id}
              onChange={(v) => setDraft((d) => ({ ...d, transport_mode_id: v }))}
              options={transportOpts.map((o) => ({
                value: String(o.id),
                label: o.label,
              }))}
              placeholder="All Transport Modes"
              emptyLabel="All Transport Modes"
            />
          </div>
          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              className="input"
              value={draft.loading_from}
              max={draft.loading_to || undefined}
              onChange={(e) =>
                setDraft((d) => ({ ...d, loading_from: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <input
              type="date"
              className="input"
              value={draft.loading_to}
              min={draft.loading_from || undefined}
              onChange={(e) =>
                setDraft((d) => ({ ...d, loading_to: e.target.value }))
              }
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Check className="h-4 w-4" /> Apply Filters
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="btn-neutral btn-sm"
              >
                <X className="h-4 w-4" /> Reset All Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- Create tiles ---- */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Link
          href="/exports/new"
          className="card p-4 flex-1 min-w-[220px] flex items-center justify-between hover:border-primary-300 hover:shadow-sm transition group"
        >
          <span className="flex items-center gap-2 text-foreground font-medium">
            <Truck className="h-4 w-4 text-primary-600" /> Export Tracking
          </span>
          <span className="flex items-center gap-1 text-xs text-primary-600 group-hover:text-primary-700">
            <Plus className="h-3.5 w-3.5" /> New Export
          </span>
        </Link>
        <Link
          href="/exports/bulk-new"
          className="card p-4 flex-1 min-w-[220px] flex items-center justify-between hover:border-amber-300 dark:hover:border-amber-500/40 hover:shadow-sm transition group"
        >
          <span className="flex items-center gap-2 text-foreground font-medium">
            <Layers className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Bulk Create
          </span>
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300">
            <Plus className="h-3.5 w-3.5" /> Many against one license
          </span>
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">
          {error}
        </div>
      )}

      {/* ---- List card ---- */}
      <DataTable<ExportRow>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        title="Export List"
        searchPlaceholder="Search MCA ref, client, license, invoice..."
        emptyMessage="No export files match these filters — clear them, or create one."
        columns={[
          {
            key: 'mca_ref',
            header: 'MCA Ref',
            render: (r: ExportRow) =>
              r.mca_ref ? (
                <span className="inline-block rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 px-2 py-0.5 text-[11px] font-mono font-medium">
                  {r.mca_ref}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
          { key: 'client_name', header: 'Client', className: 'font-medium' },
          { key: 'license_number', header: 'License', className: 'font-mono text-xs' },
          { key: 'invoice', header: 'Invoice', className: 'text-xs' },
          {
            key: 'loading_date',
            header: 'Loading Date',
            className: 'text-xs',
            render: (r: ExportRow) => fmtDate(r.loading_date) || <span className="text-muted-foreground">—</span>,
          },
          {
            key: 'weight',
            header: 'Weight (MT)',
            align: 'right',
            className: 'text-xs',
            render: (r: ExportRow) => (r.weight ? `${fmtNum(r.weight)}` : <span className="text-muted-foreground">—</span>),
          },
          {
            key: 'fob',
            header: 'FOB',
            align: 'right',
            className: 'text-xs',
            render: (r: ExportRow) => fmtNum(r.fob) || <span className="text-muted-foreground">—</span>,
          },
          {
            key: 'clearing_status_name',
            header: 'Clearing Status',
            render: (r: ExportRow) =>
              r.clearing_status_name ? (
                <span className="inline-block rounded-full bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30 px-2.5 py-0.5 text-[11px] font-medium uppercase">
                  {r.clearing_status_name}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
        ]}
        actions={(r) => ({
          view: () => setViewId(r.id),
          edit: `/exports/${r.id}`,
          extra: (
            <a
              href={`/api/v1/exports/${r.id}/export`}
              title="Export to Excel"
              className="btn-excel btn-icon ms-1"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </a>
          ),
        })}
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

      {viewId !== null && (
        <RecordViewModal
          slug="export"
          entityId={viewId}
          editHref={`/exports/${viewId}`}
          onExport={() => window.location.assign(`/api/v1/exports/${viewId}/export`)}
          onClose={() => setViewId(null)}
        />
      )}
    </>
  );
}
