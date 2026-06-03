'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus, Search, Edit2, Filter, Check, X, FileText,
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { LicenseListRow } from '@/types';

// Status → badge colour. Mirrors the source license statuses.
const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
  ANNULATED: 'bg-red-100 text-red-800 border-red-200',
  MODIFIED: 'bg-amber-100 text-amber-800 border-amber-200',
  PROROGATED: 'bg-cyan-100 text-cyan-800 border-cyan-200',
};

interface FilterState {
  client_id: string;
  transport_mode_id: string;
  start_date: string;
  end_date: string;
}

const EMPTY_FILTERS: FilterState = {
  client_id: '', transport_mode_id: '', start_date: '', end_date: '',
};

interface ClientOption { id: number; short_name: string }
interface TransportOption { id: number; transport_mode_name: string }

function fmtDate(d: string | null): string {
  if (!d) return '';
  // Date columns arrive as 'YYYY-MM-DD'; render dd/mm/yyyy without timezone shifts.
  const [y, m, day] = d.slice(0, 10).split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
}

export default function LicensesListPage() {
  const [items, setItems] = useState<LicenseListRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Advanced filter dropdown data.
  const [clientOpts, setClientOpts] = useState<ClientOption[]>([]);
  const [transportOpts, setTransportOpts] = useState<TransportOption[]>([]);

  // `draft` = what's in the filter inputs; `applied` = what's been submitted.
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (applied.client_id) params.set('client_id', applied.client_id);
      if (applied.transport_mode_id) params.set('transport_mode_id', applied.transport_mode_id);
      if (applied.start_date) params.set('start_date', applied.start_date);
      if (applied.end_date) params.set('end_date', applied.end_date);
      const res = await fetch(`/api/licenses?${params.toString()}`);
      const json = await res.json();
      if (json.success) setItems(json.data);
    } catch {
      // ignore — list will be empty
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => { load(); }, [load]);

  // Filter dropdown options — fetched once.
  useEffect(() => {
    (async () => {
      try {
        const [cRes, tRes] = await Promise.all([
          fetch('/api/clients'),
          fetch('/api/transport-modes'),
        ]);
        const [cJson, tJson] = await Promise.all([cRes.json(), tRes.json()]);
        if (cJson.success) setClientOpts(cJson.data);
        if (tJson.success) setTransportOpts(tJson.data);
      } catch {
        // ignore — filters just stay empty
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      (i.license_number ?? '').toLowerCase().includes(q) ||
      (i.client_name ?? '').toLowerCase().includes(q) ||
      (i.bank_name ?? '').toLowerCase().includes(q) ||
      (i.invoice_number ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } =
    usePagedList(filtered, { initialPageSize: 25 });

  const hasActiveFilters = !!(applied.client_id || applied.transport_mode_id || applied.start_date || applied.end_date);

  function applyFilters() {
    if (draft.start_date && draft.end_date && draft.start_date > draft.end_date) {
      // Guard the obvious inversion; the date inputs already constrain min/max below.
      return;
    }
    setApplied(draft);
    resetPage();
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    resetPage();
  }

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>

      {/* ---- Page header ---- */}
      <div className="card p-4 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary-600" />
          Licenses Management
        </h1>
      </div>

      {/* ---- Advanced Filters ---- */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
          <Filter className="h-4 w-4 text-primary-600" />
          <span className="font-semibold text-slate-800">Advanced Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
          <div>
            <label className="label">Client</label>
            <select
              className="input"
              value={draft.client_id}
              onChange={(e) => setDraft((d) => ({ ...d, client_id: e.target.value }))}
            >
              <option value="">All Clients</option>
              {clientOpts.map((c) => (<option key={c.id} value={c.id}>{c.short_name}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Transport Mode</label>
            <select
              className="input"
              value={draft.transport_mode_id}
              onChange={(e) => setDraft((d) => ({ ...d, transport_mode_id: e.target.value }))}
            >
              <option value="">All Transport Modes</option>
              {transportOpts.map((t) => (<option key={t.id} value={t.id}>{t.transport_mode_name}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              className="input"
              value={draft.start_date}
              max={draft.end_date || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <input
              type="date"
              className="input"
              value={draft.end_date}
              min={draft.start_date || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={applyFilters} className="btn-primary inline-flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Apply Filters
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-500 hover:bg-slate-600 text-white px-3 py-1.5 text-sm font-medium transition"
              >
                <X className="h-4 w-4" /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- Create card — links to /license/new ---- */}
      <Link
        href="/license/new"
        className="card p-4 mb-4 flex items-center justify-between hover:border-primary-300 hover:shadow-sm transition group"
      >
        <span className="flex items-center gap-2 text-slate-800 font-medium">
          <FileText className="h-4 w-4 text-primary-600" />
          Create License
        </span>
        <span className="flex items-center gap-1 text-xs text-primary-600 group-hover:text-primary-700">
          <Plus className="h-3.5 w-3.5" />
          New License
        </span>
      </Link>

      {/* ---- List card ---- */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-800">License List</span>
          {hasActiveFilters && (
            <span className="text-[11px] rounded-full bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5">
              filtered
            </span>
          )}
        </div>

        {/* Toolbar: page-size + search */}
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-sm">
            <select
              className="input py-1 px-2 text-sm w-auto"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {[10, 25, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
            <span className="text-slate-500">entries per page</span>
          </div>

          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9 text-sm w-64"
              placeholder="Search license, client, bank, invoice..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>License Number</th>
                <th>Client</th>
                <th>Kind</th>
                <th>Bank</th>
                <th>Transport</th>
                <th>Invoice #</th>
                <th>Applied</th>
                <th>Expiry</th>
                <th>Status</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} className="text-center text-slate-500 py-8">Loading...</td></tr>
              )}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={11} className="text-center text-slate-500 py-8">
                  No licenses found — click <strong>New License</strong> to create one.
                </td></tr>
              )}
              {!loading && paged.map((l, idx) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-mono text-xs font-medium">{l.license_number || <span className="text-slate-300">—</span>}</td>
                  <td className="font-medium">{l.client_name || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{l.kind_name || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{l.bank_name || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{l.transport_mode_name || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{l.invoice_number || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{fmtDate(l.license_applied_date) || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{fmtDate(l.license_expiry_date) || <span className="text-slate-300">—</span>}</td>
                  <td>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${STATUS_BADGE[l.status] ?? STATUS_BADGE.INACTIVE}`}>
                      {l.status}
                    </span>
                  </td>
                  <td>
                    <div className="inline-flex justify-center w-full">
                      <Link
                        href={`/license/${l.id}`}
                        title="Edit"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary-600 hover:bg-primary-700 text-white transition"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Link>
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
          setPageSize={setPageSize}
          totalRows={totalRows}
          totalPages={totalPages}
          startIndex={startIndex}
          mounted={mounted}
        />
      </div>
    </DashboardShell>
  );
}
