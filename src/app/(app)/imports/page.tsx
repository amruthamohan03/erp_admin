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
  Boxes,
  CheckCircle2,
  Activity,
  FileX,
  CalendarX,
  ShieldAlert,
  ClipboardCheck,
  Archive,
  LogIn,
  Wallet,
  Receipt,
  LogOut,
  Send,
  Layers,
  Eye,
  FileSpreadsheet,
} from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import RecordViewModal from '@/components/transactional/RecordViewModal';
import BulkUpdateModal from '@/modules/imports/BulkUpdateModal';
import { isPendingFilter } from '@/lib/imports/bulkFields';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { CLIENT_OPTION_LABEL_FIELD } from '@/lib/clientOptions';
import { formatDate } from '@/lib/formatDate';

const fmtDate = (v: unknown): string => formatDate(v, '');

interface ImportRow {
  id: number;
  mca_ref: string | null;
  invoice: string | null;
  client_name: string | null;
  license_number: string | null;
  regime_name: string | null;
  clearing_status_name: string | null;
  pre_alert_date: string | null;
  fob: string | null;
  weight: string | null;
}

interface DashboardCard {
  id: number;
  card_content_id: string;
  card_title: string;
  card_icon: string | null;
  card_color: string | null;
  card_category: string | null;
}

// Joined import detail rendered read-only in the View popup
// (from /api/v1/imports/[id]). Curated subset — list columns plus the
// milestone dates/refs that back the dashboard cards. Keys mirror the
// restructure [id] GET select (e.g. `license_no`, `type_of_goods_name`).
const COLOR_GRADIENTS: Record<string, string> = {
  primary: 'from-indigo-500 to-purple-600',
  emerald: 'from-emerald-500 to-teal-500',
  sky: 'from-sky-500 to-blue-600',
  slate: 'from-slate-500 to-slate-700',
  fuchsia: 'from-fuchsia-500 to-pink-600',
  cyan: 'from-cyan-500 to-blue-500',
  rose: 'from-rose-500 to-red-500',
  teal: 'from-teal-500 to-emerald-600',
  violet: 'from-violet-500 to-indigo-600',
  amber: 'from-amber-500 to-orange-500',
  yellow: 'from-yellow-500 to-amber-600',
  red: 'from-red-500 to-rose-600',
  orange: 'from-orange-500 to-amber-600',
  lime: 'from-lime-500 to-green-600',
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Boxes,
  CheckCircle2,
  Activity,
  Truck,
  FileX,
  CalendarX,
  ShieldAlert,
  ClipboardCheck,
  Archive,
  LogIn,
  Wallet,
  Receipt,
  LogOut,
  Send,
};

interface FilterState {
  client_id: string;
  type_of_goods: string;
  entry_point_id: string;
  transport_mode: string;
  start_date: string;
  end_date: string;
}
const EMPTY_FILTERS: FilterState = {
  client_id: '',
  type_of_goods: '',
  entry_point_id: '',
  transport_mode: '',
  start_date: '',
  end_date: '',
};

interface Option {
  id: number;
  label: string;
}

// §8 — the clickable status cards that actually filter the grid. Summary tiles
// (this_month / total_fob / total_weight) render a number but are not filters.
// Keys mirror the shared server predicates in src/db/queries/importFilters.ts.
const STATUS_FILTER_KEYS = new Set<string>([
  'completed', 'in_progress', 'in_transit', 'crf_missing', 'ad_missing',
  'insurance_missing', 'audited_pending', 'archived_pending', 'dgda_in_pending',
  'liquidation_pending', 'quittance_pending', 'dgda_out_pending', 'dispatch_deliver_pending',
]);

function fmtNum(n: string | null): string {
  if (n === null || n === '') return '';
  const v = Number(n);
  return Number.isNaN(v)
    ? n
    : v.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

// Fetch a master endpoint as {id,label} options. Restructure masters
// return the `{ ok, data: [...] }` envelope.
async function fetchOptions(
  source: string,
  labelKey: string,
): Promise<Option[]> {
  try {
    // pageSize=100 is the universal cap the list-query schemas accept; a larger
    // value throws Zod validation (422) and leaves the dropdown empty.
    const r = await fetch(`/api/v1/${source}?pageSize=100`);
    const j = await r.json();
    const list: Array<Record<string, unknown>> = Array.isArray(j?.data)
      ? j.data
      : [];
    return list
      .map((row) => ({
        id: row.id as number,
        label: String(row[labelKey] ?? row.id),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  } catch {
    return [];
  }
}

// Advanced-filter draft state → server query params. Date range maps to
// the pre-alert range the imports route already supports.
function buildParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.client_id) p.set('client_id', f.client_id);
  if (f.type_of_goods) p.set('type_of_goods_id', f.type_of_goods);
  if (f.entry_point_id) p.set('entry_point_id', f.entry_point_id);
  if (f.transport_mode) p.set('transport_mode_id', f.transport_mode);
  if (f.start_date) p.set('pre_alert_from', f.start_date);
  if (f.end_date) p.set('pre_alert_to', f.end_date);
  return p;
}

export default function ImportsListPage() {
  const [items, setItems] = useState<ImportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [clientOpts, setClientOpts] = useState<Option[]>([]);
  const [goodsOpts, setGoodsOpts] = useState<Option[]>([]);
  const [entryOpts, setEntryOpts] = useState<Option[]>([]);
  const [transportOpts, setTransportOpts] = useState<Option[]>([]);

  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);
  // §8 — status cards clicked, combined with AND. Empty ⇒ "Total" (all rows).
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});

  // View-details modal (per-row eye action) — null when closed, else row id.
  const [viewId, setViewId] = useState<number | null>(null);

  // §9 Bulk Update — enabled only when a "pending" card filter is active (the
  // three clearing-status cards name no field to fill in).
  const [bulkOpen, setBulkOpen] = useState(false);
  const pendingActive = activeFilters.filter(isPendingFilter);

  const reloadStats = useCallback(() => {
    fetch('/api/v1/imports/stats')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setStats(j.data as Record<string, number>);
      })
      .catch(() => {});
  }, []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // CSV/XLSX exports: a plain navigation the server answers with an
  // attachment. export-all carries the current advanced filters + search.
  function exportOne(id: number): void {
    window.location.assign(`/api/v1/imports/${id}/export`);
  }
  function exportAll(): void {
    const params = buildParams(applied);
    if (search.trim()) params.set('q', search.trim());
    const qs = params.toString();
    window.location.assign(`/api/v1/imports/export${qs ? `?${qs}` : ''}`);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams(applied);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (search.trim()) params.set('q', search.trim());
      if (activeFilters.length) params.set('status_filters', activeFilters.join(','));
      const res = await fetch(`/api/v1/imports?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [applied, page, pageSize, search, activeFilters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Dashboard cards (role-scoped) + stat totals — fetched once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cardsRes, statsRes] = await Promise.all([
          fetch('/api/v1/dashboard-cards/me').then((r) => r.json()),
          fetch('/api/v1/imports/stats').then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (cardsRes.ok) {
          setCards(
            (cardsRes.data as DashboardCard[]).filter(
              (c) => c.card_category === 'import_dashboard',
            ),
          );
        }
        if (statsRes.ok) setStats(statsRes.data as Record<string, number>);
      } catch {
        // ignore — cards simply won't render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter dropdown options — fetched once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, g, e, t] = await Promise.all([
        // Clients are labelled by short code app-wide (§4.15).
        fetchOptions('clients', CLIENT_OPTION_LABEL_FIELD),
        fetchOptions('goods-types', 'goods_type'),
        fetchOptions('transit-points', 'transit_point_name'),
        fetchOptions('transport-modes', 'transport_mode_name'),
      ]);
      if (cancelled) return;
      setClientOpts(c);
      setGoodsOpts(g);
      setEntryOpts(e);
      setTransportOpts(t);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasActiveFilters = Object.values(applied).some(Boolean);

  function applyFilters() {
    if (draft.start_date && draft.end_date && draft.start_date > draft.end_date)
      return;
    setApplied(draft);
    setPage(1);
  }
  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setActiveFilters([]);
    setPage(1);
  }

  // Click a card: Total clears; a status card toggles into the AND set; a
  // summary tile (fob/weight/month) is display-only and does nothing.
  function toggleCard(key: string) {
    if (key === 'total') {
      setActiveFilters([]);
    } else if (STATUS_FILTER_KEYS.has(key)) {
      setActiveFilters((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
      );
    } else {
      return; // summary tile — not a filter
    }
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <>
      <div className="card p-4 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary-600" /> Import Management
        </h1>
        <button
          type="button"
          onClick={exportAll}
          title="Export all imports (respects active filters) to Excel/CSV"
          className="btn-excel btn-sm"
        >
          <FileSpreadsheet className="h-4 w-4" /> Export All to Excel
        </button>
      </div>

      {/* ---- Stat cards (dashboard_card_master_t, category import_dashboard) ---- */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
          {cards.map((card) => {
            const key = card.card_content_id;
            const Icon = (card.card_icon && ICONS[card.card_icon]) || Layers;
            const gradient =
              (card.card_color && COLOR_GRADIENTS[card.card_color]) ||
              COLOR_GRADIENTS.primary;
            const isFilter = key === 'total' || STATUS_FILTER_KEYS.has(key);
            const active =
              key === 'total'
                ? activeFilters.length === 0
                : activeFilters.includes(key);
            const value = stats[key] ?? 0;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => toggleCard(key)}
                className={`text-left rounded-xl bg-gradient-to-br ${gradient} text-white p-3 shadow-sm relative overflow-hidden transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-slate-900/40' : ''} ${isFilter ? '' : 'cursor-default'}`}
                title={isFilter ? `Filter: ${card.card_title}` : card.card_title}
              >
                <div className="absolute right-2 top-2">
                  {active && isFilter ? (
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white text-slate-900 shadow">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <Icon className="h-5 w-5 opacity-30" />
                  )}
                </div>
                <div className="text-2xl font-bold leading-none">{value}</div>
                <div className="text-[11px] mt-1 opacity-90 uppercase tracking-wide">
                  {card.card_title}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ---- Advanced Filters ---- */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
          <Filter className="h-4 w-4 text-primary-600" />
          <span className="font-semibold text-slate-800">Advanced Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="label">Filter by Clients</label>
            <SearchableSelect
              aria-label="Client"
              value={draft.client_id}
              emptyLabel="All Clients"
              placeholder="All Clients"
              options={clientOpts.map((o) => ({ value: String(o.id), label: o.label }))}
              onChange={(v) => setDraft((d) => ({ ...d, client_id: v }))}
            />
          </div>
          <div>
            <label className="label">Type of Goods</label>
            <SearchableSelect
              aria-label="Type of goods"
              value={draft.type_of_goods}
              emptyLabel="All Types of Goods"
              placeholder="All Types of Goods"
              options={goodsOpts.map((o) => ({ value: String(o.id), label: o.label }))}
              onChange={(v) => setDraft((d) => ({ ...d, type_of_goods: v }))}
            />
          </div>
          <div>
            <label className="label">Entry Point</label>
            <SearchableSelect
              aria-label="Entry point"
              value={draft.entry_point_id}
              emptyLabel="All Entry Points"
              placeholder="All Entry Points"
              options={entryOpts.map((o) => ({ value: String(o.id), label: o.label }))}
              onChange={(v) => setDraft((d) => ({ ...d, entry_point_id: v }))}
            />
          </div>
          <div>
            <label className="label">Transport Mode</label>
            <SearchableSelect
              aria-label="Transport mode"
              value={draft.transport_mode}
              emptyLabel="All Transport Modes"
              placeholder="All Transport Modes"
              options={transportOpts.map((o) => ({ value: String(o.id), label: o.label }))}
              onChange={(v) => setDraft((d) => ({ ...d, transport_mode: v }))}
            />
          </div>
          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              className="input"
              value={draft.start_date}
              max={draft.end_date || undefined}
              onChange={(e) =>
                setDraft((d) => ({ ...d, start_date: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <input
              type="date"
              className="input"
              value={draft.end_date}
              min={draft.start_date || undefined}
              onChange={(e) =>
                setDraft((d) => ({ ...d, end_date: e.target.value }))
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
            {(hasActiveFilters || activeFilters.length > 0) && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-500 hover:bg-slate-600 text-white px-3 py-1.5 text-sm font-medium transition"
              >
                <X className="h-4 w-4" /> Reset All Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- Create ---- */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Link
          href="/imports/new"
          className="card p-4 flex-1 min-w-[220px] flex items-center justify-between hover:border-primary-300 hover:shadow-sm transition group"
        >
          <span className="flex items-center gap-2 text-slate-800 font-medium">
            <Truck className="h-4 w-4 text-primary-600" /> Import Tracking
          </span>
          <span className="flex items-center gap-1 text-xs text-primary-600 group-hover:text-primary-700">
            <Plus className="h-3.5 w-3.5" /> New Import
          </span>
        </Link>
        <Link
          href="/imports/partielles"
          className="card p-4 flex-1 min-w-[220px] flex items-center justify-between hover:border-primary-300 hover:shadow-sm transition group"
        >
          <span className="flex items-center gap-2 text-slate-800 font-medium">
            <Layers className="h-4 w-4 text-primary-600" /> PARTIELLE Allocation
          </span>
          <span className="text-xs text-primary-600 group-hover:text-primary-700">
            Manage allotments
          </span>
        </Link>
      </div>

      {/* ---- List card ---- */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-slate-800">Imports List</span>
          {activeFilters.map((key) => (
            <span
              key={key}
              className="text-[11px] rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5"
            >
              {cards.find((c) => c.card_content_id === key)?.card_title ?? key}
            </span>
          ))}
        </div>

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-sm">
            <SearchableSelect
              size="sm"
              className="w-24"
              aria-label="Imports per page"
              value={String(pageSize)}
              options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            />
            <span className="text-muted-foreground">imports per page</span>
            {pendingActive.length > 0 && (
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                title="Bulk-edit the fields for the active pending filters"
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-sm font-medium transition"
              >
                <ClipboardCheck className="h-4 w-4" /> Bulk Update ({pendingActive.length})
              </button>
            )}
          </div>
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              className="input pl-9 text-sm w-64"
              placeholder="Search MCA ref, client, invoice..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>MCA Ref</th>
                <th>Client</th>
                <th>License</th>
                <th>Invoice</th>
                <th>Pre-Alert Date</th>
                <th className="text-right">Weight</th>
                <th className="text-right">FOB</th>
                <th>Clearing Status</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="text-center text-muted-foreground py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-muted-foreground py-8">
                    No imports found — click <strong>New Import</strong> to
                    create one.
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="text-muted-foreground font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td>
                      {r.mca_ref ? (
                        <span className="inline-block rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[11px] font-mono font-medium">
                          {r.mca_ref}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="font-medium">
                      {r.client_name || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="font-mono text-xs">
                      {r.license_number || (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="text-slate-700 text-xs">
                      {r.invoice || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="text-slate-700 text-xs">
                      {fmtDate(r.pre_alert_date) || (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="text-right text-slate-700 text-xs">
                      {r.weight ? (
                        `${fmtNum(r.weight)} KG`
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="text-right text-slate-700 text-xs">
                      {fmtNum(r.fob) || <span className="text-slate-300">—</span>}
                    </td>
                    <td>
                      {r.clearing_status_name ? (
                        <span className="inline-block rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200 px-2.5 py-0.5 text-[11px] font-medium uppercase">
                          {r.clearing_status_name}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td>
                      <div className="inline-flex rounded-md shadow-sm overflow-hidden w-full justify-center">
                        <button
                          type="button"
                          onClick={() => setViewId(r.id)}
                          title="View details"
                          className="btn-view btn-icon"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <Link
                          href={`/imports/${r.id}`}
                          title="Edit"
                          className="btn-edit btn-icon"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => exportOne(r.id)}
                          title="Export to Excel"
                          className="btn-excel btn-icon transition"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          totalRows={total}
          totalPages={totalPages}
          startIndex={startIndex}
          mounted={mounted}
        />
      </div>

      {viewId !== null && (
        <RecordViewModal
          slug="import"
          entityId={viewId}
          editHref={`/imports/${viewId}`}
          onExport={() => exportOne(viewId)}
          onClose={() => setViewId(null)}
        />
      )}

      {bulkOpen && (
        <BulkUpdateModal
          statusFilters={pendingActive}
          extra={{
            client_id: applied.client_id ? Number(applied.client_id) : undefined,
            pre_alert_from: applied.start_date || undefined,
            pre_alert_to: applied.end_date || undefined,
          }}
          onClose={() => setBulkOpen(false)}
          onSaved={() => {
            setBulkOpen(false);
            load();
            reloadStats();
          }}
        />
      )}
    </>
  );
}
