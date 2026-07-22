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
  TrendingUp,
  Weight,
} from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatCard from '@/components/ui/StatCard';

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

// Read-only detail rendered in the View popup (from /api/v1/exports/{id}).
interface ViewExport {
  id: number;
  mca_ref: string | null;
  client_name: string | null;
  license_no: string | null;
  kind_name: string | null;
  type_of_goods_name: string | null;
  transport_mode_name: string | null;
  buyer: string | null;
  regime_name: string | null;
  types_of_clearance_name: string | null;
  invoice: string | null;
  po_ref: string | null;
  bp_no: string | null;
  weight: string | null;
  fob: string | null;
  number_of_bags: number | null;
  lot_number: string | null;
  horse: string | null;
  trailer_1: string | null;
  trailer_2: string | null;
  feet_container_size: string | null;
  wagon_ref: string | null;
  container: string | null;
  transporter: string | null;
  site_of_loading_name: string | null;
  destination: string | null;
  exit_point_name: string | null;
  dgda_seal_no: string | null;
  number_of_seals: number | null;
  ceec_amount: string | null;
  cgea_amount: string | null;
  occ_amount: string | null;
  lmc_amount: string | null;
  ogefrem_amount: string | null;
  loading_date: string | null;
  ceec_in_date: string | null;
  ceec_out_date: string | null;
  min_div_in_date: string | null;
  min_div_out_date: string | null;
  document_status_name: string | null;
  dgda_in_date: string | null;
  declaration_reference: string | null;
  liquidation_reference: string | null;
  liquidation_date: string | null;
  liquidation_amount: string | null;
  quittance_reference: string | null;
  quittance_date: string | null;
  dispatch_deliver_date: string | null;
  exit_drc_date: string | null;
  end_of_formalities_date: string | null;
  truck_status_name: string | null;
  clearing_status_name: string | null;
  lmc_id: string | null;
  ogefrem_inv_ref: string | null;
  lmc_date: string | null;
  ogefrem_date: string | null;
  audited_date: string | null;
  archived_date: string | null;
}

interface Option {
  id: number;
  label: string;
}

interface Stats {
  total_count: number;
  total_fob: number;
  total_weight: number;
  this_month_count: number;
}

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
function fmtDate(d: string | null): string {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
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

async function fetchOptions(
  source: string,
  labelKey: string,
): Promise<Option[]> {
  try {
    const r = await fetch(`/api/v1/${source}?pageSize=1000`);
    const j = await r.json();
    const list: Record<string, unknown>[] = Array.isArray(j?.data)
      ? j.data
      : Array.isArray(j?.data?.items)
        ? j.data.items
        : [];
    return list.map((row) => ({
      id: row.id as number,
      label: String(row[labelKey] ?? row.id),
    }));
  } catch {
    return [];
  }
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

  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewData, setViewData] = useState<ViewExport | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, t, s] = await Promise.all([
        fetchOptions('clients', 'name'),
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
    return params;
  }, [search, applied]);

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

  async function openView(id: number): Promise<void> {
    setViewOpen(true);
    setViewLoading(true);
    setViewData(null);
    try {
      const res = await fetch(`/api/v1/exports/${id}`);
      const json = await res.json();
      if (json.ok) setViewData(json.data);
    } catch {
      // leave viewData null — modal shows "not found"
    } finally {
      setViewLoading(false);
    }
  }

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <>
      {/* ---- Header ---- */}
      <div className="card p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary-600" /> Export Management
        </h1>
        <a
          href={`/api/v1/exports/export?${buildParams().toString()}`}
          title="Excel — flat list (respects filters)"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium transition"
        >
          <FileSpreadsheet className="h-4 w-4" /> Export ALL to Excel
        </a>
      </div>

      {/* ---- Stat cards ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="Total exports"
          value={stats ? fmtCount(stats.total_count) : '—'}
        />
        <StatCard
          icon={<Calendar className="h-5 w-5" />}
          label="Loaded this month"
          value={stats ? fmtCount(stats.this_month_count) : '—'}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Total FOB"
          value={stats ? fmtNum(String(stats.total_fob)) : '—'}
        />
        <StatCard
          icon={<Weight className="h-5 w-5" />}
          label="Total Weight"
          value={stats ? fmtNum(String(stats.total_weight)) : '—'}
        />
      </div>

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
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-500 hover:bg-slate-600 text-white px-3 py-1.5 text-sm font-medium transition"
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
          <span className="flex items-center gap-2 text-slate-800 font-medium">
            <Truck className="h-4 w-4 text-primary-600" /> Export Tracking
          </span>
          <span className="flex items-center gap-1 text-xs text-primary-600 group-hover:text-primary-700">
            <Plus className="h-3.5 w-3.5" /> New Export
          </span>
        </Link>
        <Link
          href="/exports/bulk-new"
          className="card p-4 flex-1 min-w-[220px] flex items-center justify-between hover:border-amber-300 hover:shadow-sm transition group"
        >
          <span className="flex items-center gap-2 text-slate-800 font-medium">
            <Layers className="h-4 w-4 text-amber-600" /> Bulk Create
          </span>
          <span className="flex items-center gap-1 text-xs text-amber-600 group-hover:text-amber-700">
            <Plus className="h-3.5 w-3.5" /> Many against one license
          </span>
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* ---- List card ---- */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <Truck className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-800">Exports List</span>
        </div>

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
            <span className="text-slate-500">exports per page</span>
          </div>
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9 text-sm w-64"
              placeholder="Search MCA ref, client, invoice, buyer..."
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
                <th>Loading Date</th>
                <th className="text-right">Weight (MT)</th>
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
                    No exports found — click <strong>New Export</strong> to
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
                      {fmtDate(r.loading_date) || (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="text-right text-slate-700 text-xs">
                      {r.weight ? (
                        `${fmtNum(r.weight)} MT`
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
                          href={`/exports/${r.id}`}
                          title="Edit"
                          className="inline-flex items-center justify-center w-7 h-7 bg-primary-600 hover:bg-primary-700 text-white transition"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Link>
                        <a
                          href={`/api/v1/exports/${r.id}/export`}
                          title="Export to Excel"
                          className="inline-flex items-center justify-center w-7 h-7 bg-emerald-600 hover:bg-emerald-700 text-white transition"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </a>
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

      {/* ---- View details popup ---- */}
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
              className={`flex items-center justify-between px-5 py-4 text-white bg-gradient-to-br ${CARD_GRADIENT}`}
            >
              <h2 className="font-semibold flex items-center gap-2">
                <Eye className="h-5 w-5" /> Export Details
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
                  Export not found.
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
                      ['Transport Mode', viewData.transport_mode_name],
                      ['Buyer', viewData.buyer],
                      ['Regime', viewData.regime_name],
                      ['Clearance Type', viewData.types_of_clearance_name],
                      ['Invoice', viewData.invoice],
                      ['PO Ref', viewData.po_ref],
                      ['BP Number', viewData.bp_no],
                      [
                        'Weight',
                        viewData.weight ? `${fmtNum(viewData.weight)} MT` : null,
                      ],
                      ['FOB', viewData.fob ? fmtNum(viewData.fob) : null],
                      ['No. of Bags', viewData.number_of_bags],
                      ['Lot Number', viewData.lot_number],
                      ['Horse', viewData.horse],
                      ['Trailer 1', viewData.trailer_1],
                      ['Trailer 2', viewData.trailer_2],
                      ['Feet Container', viewData.feet_container_size],
                      ['Wagon Reference', viewData.wagon_ref],
                      ['Container', viewData.container],
                      ['Transporter', viewData.transporter],
                      ['Site of Loading', viewData.site_of_loading_name],
                      ['Destination', viewData.destination],
                      ['Exit Point', viewData.exit_point_name],
                      ['DGDA Seal No', viewData.dgda_seal_no],
                      ['No. of Seals', viewData.number_of_seals],
                      [
                        'CEEC Amount',
                        viewData.ceec_amount ? fmtNum(viewData.ceec_amount) : null,
                      ],
                      [
                        'CGEA Amount',
                        viewData.cgea_amount ? fmtNum(viewData.cgea_amount) : null,
                      ],
                      [
                        'OCC Amount',
                        viewData.occ_amount ? fmtNum(viewData.occ_amount) : null,
                      ],
                      [
                        'LMC Amount',
                        viewData.lmc_amount ? fmtNum(viewData.lmc_amount) : null,
                      ],
                      [
                        'OGEFREM Amount',
                        viewData.ogefrem_amount
                          ? fmtNum(viewData.ogefrem_amount)
                          : null,
                      ],
                      ['Loading Date', fmtDate(viewData.loading_date)],
                      ['CEEC In', fmtDate(viewData.ceec_in_date)],
                      ['CEEC Out', fmtDate(viewData.ceec_out_date)],
                      ['Min Div In', fmtDate(viewData.min_div_in_date)],
                      ['Min Div Out', fmtDate(viewData.min_div_out_date)],
                      ['Document Status', viewData.document_status_name],
                      ['DGDA In Date', fmtDate(viewData.dgda_in_date)],
                      ['Declaration Ref', viewData.declaration_reference],
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
                      ['Exit DRC Date', fmtDate(viewData.exit_drc_date)],
                      [
                        'End of Formalities',
                        fmtDate(viewData.end_of_formalities_date),
                      ],
                      ['Truck Status', viewData.truck_status_name],
                      ['LMC ID', viewData.lmc_id],
                      ['OGEFREM Inv.Ref.', viewData.ogefrem_inv_ref],
                      ['LMC Date', fmtDate(viewData.lmc_date)],
                      ['OGEFREM Date', fmtDate(viewData.ogefrem_date)],
                      ['Audited Date', fmtDate(viewData.audited_date)],
                      ['Archived Date', fmtDate(viewData.archived_date)],
                    ] as Array<[string, string | number | null | undefined]>
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
                  href={`/exports/${viewData.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 text-sm font-medium transition"
                >
                  <Edit2 className="h-4 w-4" /> Edit
                </Link>
              )}
              {viewData && (
                <a
                  href={`/api/v1/exports/${viewData.id}/export`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium transition"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Export
                </a>
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
