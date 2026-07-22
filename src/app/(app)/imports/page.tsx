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
interface ViewImport {
  id: number;
  mca_ref: string | null;
  client_name: string | null;
  license_no: string | null;
  kind_name: string | null;
  type_of_goods_name: string | null;
  transport_mode_name: string | null;
  regime_name: string | null;
  types_of_clearance_name: string | null;
  commodity_name: string | null;
  supplier: string | null;
  po_ref: string | null;
  invoice: string | null;
  license_invoice_number: string | null;
  pre_alert_date: string | null;
  fret: string | null;
  other_charges: string | null;
  weight: string | null;
  m3: string | null;
  fob: string | null;
  insurance_date: string | null;
  insurance_amount: string | null;
  insurance_reference: string | null;
  crf_reference: string | null;
  crf_received_date: string | null;
  ad_date: string | null;
  audited_date: string | null;
  archived_date: string | null;
  entry_point_name: string | null;
  dgda_in_date: string | null;
  declaration_reference: string | null;
  customs_clearance_code: string | null;
  dgda_out_date: string | null;
  document_status_name: string | null;
  liquidation_reference: string | null;
  liquidation_date: string | null;
  liquidation_amount: string | null;
  quittance_reference: string | null;
  quittance_date: string | null;
  dispatch_deliver_date: string | null;
  clearing_status_name: string | null;
}

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

function fmtDate(d: string | null): string {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
}
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
    const r = await fetch(`/api/v1/${source}?pageSize=1000`);
    const j = await r.json();
    const list: Array<Record<string, unknown>> = Array.isArray(j?.data)
      ? j.data
      : [];
    return list.map((row) => ({
      id: row.id as number,
      label: String(row[labelKey] ?? row.id),
    }));
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
  const [activeCard, setActiveCard] = useState<string>('all');

  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});

  // View-details popup (per-row eye action).
  const [viewOpen, setViewOpen] = useState(false);
  const [viewData, setViewData] = useState<ViewImport | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // CSV/XLSX exports: a plain navigation the server answers with an
  // attachment. export-all carries the current advanced filters + search.
  function exportOne(id: number): void {
    window.location.href = `/api/v1/imports/${id}/export`;
  }
  function exportAll(): void {
    const params = buildParams(applied);
    if (search.trim()) params.set('q', search.trim());
    const qs = params.toString();
    window.location.href = `/api/v1/imports/export${qs ? `?${qs}` : ''}`;
  }

  async function openView(id: number): Promise<void> {
    setViewOpen(true);
    setViewLoading(true);
    setViewData(null);
    try {
      const res = await fetch(`/api/v1/imports/${id}`);
      const json = await res.json();
      if (json.ok) setViewData(json.data);
    } catch {
      // ignore — modal shows nothing and can be closed
    } finally {
      setViewLoading(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams(applied);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (search.trim()) params.set('q', search.trim());
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
  }, [applied, page, pageSize, search]);

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
        fetchOptions('clients', 'name'),
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
    setActiveCard('all');
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
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium transition"
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
            const active = activeCard === key;
            const value = stats[key] ?? 0;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setActiveCard(key);
                  setPage(1);
                }}
                className={`text-left rounded-xl bg-gradient-to-br ${gradient} text-white p-3 shadow-sm relative overflow-hidden transition hover:shadow-md ${active ? 'ring-2 ring-offset-2 ring-slate-900/40' : ''}`}
                title={`Filter: ${card.card_title}`}
              >
                <div className="absolute right-2 top-2 opacity-30">
                  <Icon className="h-5 w-5" />
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
            <select
              className="input"
              value={draft.client_id}
              onChange={(e) =>
                setDraft((d) => ({ ...d, client_id: e.target.value }))
              }
            >
              <option value="">All Clients</option>
              {clientOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Type of Goods</label>
            <select
              className="input"
              value={draft.type_of_goods}
              onChange={(e) =>
                setDraft((d) => ({ ...d, type_of_goods: e.target.value }))
              }
            >
              <option value="">All Types of Goods</option>
              {goodsOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Entry Point</label>
            <select
              className="input"
              value={draft.entry_point_id}
              onChange={(e) =>
                setDraft((d) => ({ ...d, entry_point_id: e.target.value }))
              }
            >
              <option value="">All Entry Points</option>
              {entryOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Transport Mode</label>
            <select
              className="input"
              value={draft.transport_mode}
              onChange={(e) =>
                setDraft((d) => ({ ...d, transport_mode: e.target.value }))
              }
            >
              <option value="">All Transport Modes</option>
              {transportOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
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
            {(hasActiveFilters || activeCard !== 'all') && (
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
      </div>

      {/* ---- List card ---- */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <Truck className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-800">Imports List</span>
          {activeCard !== 'all' && (
            <span className="text-[11px] rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5">
              {cards.find((c) => c.card_content_id === activeCard)?.card_title ??
                activeCard}
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-sm">
            <select
              className="input py-1 px-2 text-sm w-auto"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="text-slate-500">imports per page</span>
          </div>
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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
                  <td colSpan={10} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-slate-500 py-8">
                    No imports found — click <strong>New Import</strong> to
                    create one.
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
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
                          onClick={() => openView(r.id)}
                          title="View details"
                          className="inline-flex items-center justify-center w-7 h-7 bg-slate-600 hover:bg-slate-700 text-white transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <Link
                          href={`/imports/${r.id}`}
                          title="Edit"
                          className="inline-flex items-center justify-center w-7 h-7 bg-primary-600 hover:bg-primary-700 text-white transition"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => exportOne(r.id)}
                          title="Export to Excel"
                          className="inline-flex items-center justify-center w-7 h-7 bg-emerald-600 hover:bg-emerald-700 text-white transition"
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

      {/* ---- View details popup (per-row eye action) ---- */}
      {viewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto"
          onClick={() => setViewOpen(false)}
        >
          <div
            className="card w-full max-w-2xl my-auto overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`flex items-center justify-between px-5 py-4 text-white bg-gradient-to-br ${COLOR_GRADIENTS.primary}`}
            >
              <h2 className="font-semibold flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Import Details
                {viewData?.mca_ref && (
                  <span className="ml-1 font-mono text-sm opacity-90">
                    {viewData.mca_ref}
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setViewOpen(false)}
                className="rounded-md p-1 hover:bg-white/20 transition"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              {viewLoading && (
                <div className="py-10 text-center text-sm text-slate-500">
                  Loading…
                </div>
              )}
              {!viewLoading && !viewData && (
                <div className="py-10 text-center text-sm text-slate-500">
                  Import not found.
                </div>
              )}
              {!viewLoading && viewData && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {(
                    [
                      ['MCA Ref', viewData.mca_ref],
                      ['Clearing Status', viewData.clearing_status_name],
                      ['Client', viewData.client_name],
                      ['License Number', viewData.license_no],
                      ['Kind', viewData.kind_name],
                      ['Type of Goods', viewData.type_of_goods_name],
                      ['Commodity', viewData.commodity_name],
                      ['Transport Mode', viewData.transport_mode_name],
                      ['Regime', viewData.regime_name],
                      ['Type of Clearance', viewData.types_of_clearance_name],
                      ['Supplier', viewData.supplier],
                      ['PO Ref', viewData.po_ref],
                      ['Invoice', viewData.invoice],
                      ['License Invoice #', viewData.license_invoice_number],
                      ['Pre-Alert Date', fmtDate(viewData.pre_alert_date)],
                      [
                        'Weight',
                        viewData.weight ? `${fmtNum(viewData.weight)} KG` : null,
                      ],
                      ['M3', viewData.m3],
                      ['FOB', viewData.fob ? fmtNum(viewData.fob) : null],
                      ['Freight', viewData.fret ? fmtNum(viewData.fret) : null],
                      [
                        'Other Charges',
                        viewData.other_charges
                          ? fmtNum(viewData.other_charges)
                          : null,
                      ],
                      ['Insurance Ref', viewData.insurance_reference],
                      ['Insurance Date', fmtDate(viewData.insurance_date)],
                      [
                        'Insurance Amount',
                        viewData.insurance_amount
                          ? fmtNum(viewData.insurance_amount)
                          : null,
                      ],
                      ['CRF Reference', viewData.crf_reference],
                      ['CRF Received', fmtDate(viewData.crf_received_date)],
                      ['AD Date', fmtDate(viewData.ad_date)],
                      ['Audited Date', fmtDate(viewData.audited_date)],
                      ['Archived Date', fmtDate(viewData.archived_date)],
                      ['Entry Point', viewData.entry_point_name],
                      ['DGDA In Date', fmtDate(viewData.dgda_in_date)],
                      ['Declaration Ref', viewData.declaration_reference],
                      [
                        'Customs Clearance Code',
                        viewData.customs_clearance_code,
                      ],
                      ['DGDA Out Date', fmtDate(viewData.dgda_out_date)],
                      ['Document Status', viewData.document_status_name],
                      ['Liquidation Ref', viewData.liquidation_reference],
                      ['Liquidation Date', fmtDate(viewData.liquidation_date)],
                      [
                        'Liquidation Amount',
                        viewData.liquidation_amount
                          ? fmtNum(viewData.liquidation_amount)
                          : null,
                      ],
                      ['Quittance Ref', viewData.quittance_reference],
                      ['Quittance Date', fmtDate(viewData.quittance_date)],
                      [
                        'Dispatch/Deliver Date',
                        fmtDate(viewData.dispatch_deliver_date),
                      ],
                    ] as Array<[string, string | null | undefined]>
                  ).map(([label, value]) => (
                    <div key={label} className="border-b border-slate-100 pb-2">
                      <div className="text-[11px] uppercase tracking-wide text-primary-600 font-semibold">
                        {label}
                      </div>
                      <div className="text-sm text-slate-800">
                        {value !== null && value !== undefined && value !== '' ? (
                          value
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              {viewData && (
                <Link
                  href={`/imports/${viewData.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 text-sm font-medium transition"
                >
                  <Edit2 className="h-4 w-4" /> Edit
                </Link>
              )}
              {viewData && (
                <button
                  type="button"
                  onClick={() => exportOne(viewData.id)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium transition"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Export
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-500 hover:bg-slate-600 text-white px-3 py-1.5 text-sm font-medium transition"
              >
                <X className="h-4 w-4" /> Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
