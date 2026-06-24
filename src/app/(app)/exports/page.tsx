'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Edit2,
  Plus,
  Search,
  Trash2,
  Ship,
  Calendar,
  TrendingUp,
  Weight,
  FileText,
  Download,
} from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatCard from '@/components/ui/StatCard';

interface ExportRow {
  id: number;
  mca_ref: string | null;
  invoice: string | null;
  buyer: string | null;
  loading_date: string | null;
  client_id: number | null;
  client_name: string | null;
  license_id: number | null;
  license_no: string | null;
  regime_id: number | null;
  regime_name: string | null;
  clearing_status_id: number | null;
  clearing_status_name: string | null;
  document_status_id: number | null;
  document_status_name: string | null;
  truck_status_id: number | null;
  truck_status_name: string | null;
  fob: string | null;
  weight: string | null;
  destination: string | null;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

interface ClientOption {
  id: number;
  name: string;
}
interface RegimeOption {
  id: number;
  regime_name: string;
}
interface ClearingStatusOption {
  id: number;
  clearing_status: string;
}
interface TruckStatusOption {
  id: number;
  truck_status: string;
}

interface Stats {
  total_count: number;
  total_fob: number;
  total_weight: number;
  this_month_count: number;
}

function fmtCount(n: number): string {
  return n.toLocaleString();
}

function fmtNum(v: string | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ExportsListPage() {
  const [items, setItems] = useState<ExportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [regimeFilter, setRegimeFilter] = useState('');
  const [clearingFilter, setClearingFilter] = useState('');
  const [truckFilter, setTruckFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [regimes, setRegimes] = useState<RegimeOption[]>([]);
  const [clearingStatuses, setClearingStatuses] = useState<
    ClearingStatusOption[]
  >([]);
  const [truckStatuses, setTruckStatuses] = useState<TruckStatusOption[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, r, cs, ts, s] = await Promise.all([
          fetch('/api/v1/clients?pageSize=200').then((res) => res.json()),
          fetch('/api/v1/regimes?pageSize=200').then((res) => res.json()),
          fetch('/api/v1/clearing-statuses?pageSize=200').then((res) =>
            res.json(),
          ),
          fetch('/api/v1/truck-statuses?pageSize=200').then((res) =>
            res.json(),
          ),
          fetch('/api/v1/exports/stats').then((res) => res.json()),
        ]);
        if (cancelled) return;
        if (c.ok) setClients(c.data);
        if (r.ok) setRegimes(r.data);
        if (cs.ok) setClearingStatuses(cs.data);
        if (ts.ok) setTruckStatuses(ts.data);
        if (s.ok) setStats(s.data);
      } catch {
        if (!cancelled) setError('Network error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (clientFilter) params.set('client_id', clientFilter);
      if (regimeFilter) params.set('regime_id', regimeFilter);
      if (clearingFilter) params.set('clearing_status_id', clearingFilter);
      if (truckFilter) params.set('truck_status_id', truckFilter);
      const res = await fetch(`/api/v1/exports?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      } else {
        setError(json.error?.message ?? 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, clientFilter, regimeFilter, clearingFilter, truckFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Soft-delete this export?')) return;
    const res = await fetch(`/api/v1/exports/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      alert(json.error?.message || 'Failed');
      return;
    }
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Ship className="h-6 w-6 text-primary-600" />
          Exports
        </h1>
        <div className="flex items-center gap-2">
          <a
            href={`/api/v1/exports/export?${new URLSearchParams({
              q: search,
              ...(clientFilter ? { client_id: clientFilter } : {}),
              ...(regimeFilter ? { regime_id: regimeFilter } : {}),
              ...(clearingFilter
                ? { clearing_status_id: clearingFilter }
                : {}),
              ...(truckFilter ? { truck_status_id: truckFilter } : {}),
            }).toString()}`}
            className="btn-secondary"
            title="Download current view as XLSX"
          >
            <Download className="h-4 w-4" /> Export
          </a>
          <Link href="/exports/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New Export
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search MCA ref, invoice, buyer, client..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="min-w-[180px]">
            <SearchableSelect
              value={clientFilter}
              onChange={(v) => {
                setClientFilter(v);
                setPage(1);
              }}
              options={clients.map((c) => ({
                value: String(c.id),
                label: c.name,
              }))}
              placeholder="All clients"
              emptyLabel="All clients"
            />
          </div>
          <div className="min-w-[160px]">
            <SearchableSelect
              value={regimeFilter}
              onChange={(v) => {
                setRegimeFilter(v);
                setPage(1);
              }}
              options={regimes.map((r) => ({
                value: String(r.id),
                label: r.regime_name,
              }))}
              placeholder="All regimes"
              emptyLabel="All regimes"
            />
          </div>
          <div className="min-w-[180px]">
            <SearchableSelect
              value={clearingFilter}
              onChange={(v) => {
                setClearingFilter(v);
                setPage(1);
              }}
              options={clearingStatuses.map((c) => ({
                value: String(c.id),
                label: c.clearing_status,
              }))}
              placeholder="All clearing statuses"
              emptyLabel="All clearing statuses"
            />
          </div>
          <div className="min-w-[180px]">
            <SearchableSelect
              value={truckFilter}
              onChange={(v) => {
                setTruckFilter(v);
                setPage(1);
              }}
              options={truckStatuses.map((t) => ({
                value: String(t.id),
                label: t.truck_status,
              }))}
              placeholder="All truck statuses"
              emptyLabel="All truck statuses"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>MCA Ref</th>
                <th>Invoice</th>
                <th>Client</th>
                <th>License</th>
                <th>Buyer</th>
                <th>Destination</th>
                <th>Loading</th>
                <th className="text-right">FOB</th>
                <th className="text-right">Weight</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={12} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center text-slate-500 py-8">
                    No exports found.{' '}
                    <Link
                      href="/exports/new"
                      className="text-primary-600 hover:underline"
                    >
                      Create one.
                    </Link>
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((it, idx) => (
                  <tr key={it.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td>
                      <Link
                        href={`/exports/${it.id}`}
                        className="text-primary-600 hover:underline font-medium"
                      >
                        {it.mca_ref || `#${it.id}`}
                      </Link>
                    </td>
                    <td>{it.invoice || '—'}</td>
                    <td>{it.client_name || '—'}</td>
                    <td>
                      {it.license_no ? (
                        <code className="text-xs text-slate-600">
                          {it.license_no}
                        </code>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{it.buyer || '—'}</td>
                    <td>{it.destination || '—'}</td>
                    <td>{it.loading_date || '—'}</td>
                    <td className="text-right font-mono">{fmtNum(it.fob)}</td>
                    <td className="text-right font-mono">
                      {fmtNum(it.weight)}
                    </td>
                    <td>
                      {it.clearing_status_name ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                          {it.clearing_status_name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        href={`/exports/${it.id}`}
                        className="text-slate-500 hover:text-primary-600 p-1 inline-block"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(it.id)}
                        className="text-slate-500 hover:text-red-600 p-1 ml-1"
                        title="Soft delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
    </>
  );
}
