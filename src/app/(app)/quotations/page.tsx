'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Edit2,
  FileText,
  Plus,
  Search,
  Trash2,
  Wallet,
  TrendingUp,
  Calendar,
  Coins,
} from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import SearchableSelect from '@/components/ui/SearchableSelect';

interface QuotationRow {
  id: number;
  quotation_ref: string;
  quotation_date: string | null;
  client_id: number;
  client_name: string | null;
  kind_id: number | null;
  kind_name: string | null;
  arsp: string | null;
  sub_total: string | null;
  vat_amount: string | null;
  arsp_amount: string | null;
  total_amount: string | null;
  sub_total_cdf: string | null;
  total_amount_cdf: string | null;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

interface Stats {
  total_count: number;
  total_usd: number;
  total_cdf: number;
  this_month_count: number;
}

interface ClientOption {
  id: number;
  name: string;
}

interface KindOption {
  id: number;
  kind_name: string;
}

function fmtMoney(v: string | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtCount(n: number): string {
  return n.toLocaleString();
}

export default function QuotationsListPage() {
  const [items, setItems] = useState<QuotationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [kinds, setKinds] = useState<KindOption[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // One-off picker data + stats banner — small lists, cached for the
  // session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, k, s] = await Promise.all([
          fetch('/api/v1/clients?pageSize=100').then((r) => r.json()),
          fetch('/api/v1/kinds?pageSize=100').then((r) => r.json()),
          fetch('/api/v1/quotations/stats').then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (c.ok) setClients(c.data);
        if (k.ok) setKinds(k.data);
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
      if (kindFilter) params.set('kind_id', kindFilter);
      const res = await fetch(`/api/v1/quotations?${params}`);
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
  }, [page, pageSize, search, clientFilter, kindFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Soft-delete this quotation?')) return;
    const res = await fetch(`/api/v1/quotations/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      alert(json.error?.message || 'Failed');
      return;
    }
    load();
    // refresh stats too — totals change with deletes
    fetch('/api/v1/quotations/stats')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setStats(j.data);
      });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary-600" />
          Quotations
        </h1>
        <Link href="/quotations/new" className="btn-primary">
          <Plus className="h-4 w-4" /> New Quotation
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="Total quotations"
          value={stats ? fmtCount(stats.total_count) : '—'}
        />
        <StatCard
          icon={<Calendar className="h-5 w-5" />}
          label="This month"
          value={stats ? fmtCount(stats.this_month_count) : '—'}
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="Total USD"
          value={stats ? fmtMoney(String(stats.total_usd)) : '—'}
        />
        <StatCard
          icon={<Coins className="h-5 w-5" />}
          label="Total CDF"
          value={stats ? fmtMoney(String(stats.total_cdf)) : '—'}
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
              placeholder="Search ref or client..."
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
          <div className="min-w-[180px]">
            <SearchableSelect
              value={kindFilter}
              onChange={(v) => {
                setKindFilter(v);
                setPage(1);
              }}
              options={kinds.map((k) => ({
                value: String(k.id),
                label: k.kind_name,
              }))}
              placeholder="All kinds"
              emptyLabel="All kinds"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Reference</th>
                <th>Date</th>
                <th>Client</th>
                <th>Kind</th>
                <th className="text-right">USD Total</th>
                <th className="text-right">CDF Total</th>
                <th>ARSP</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-slate-500 py-8">
                    No quotations found.{' '}
                    <Link
                      href="/quotations/new"
                      className="text-primary-600 hover:underline"
                    >
                      Create one.
                    </Link>
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((q, idx) => (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td>
                      <Link
                        href={`/quotations/${q.id}`}
                        className="text-primary-600 hover:underline font-medium"
                      >
                        {q.quotation_ref}
                      </Link>
                    </td>
                    <td>{q.quotation_date || '—'}</td>
                    <td>{q.client_name || '—'}</td>
                    <td>
                      {q.kind_name ? (
                        <code className="text-xs text-slate-600">
                          {q.kind_name}
                        </code>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-right font-mono">
                      {fmtMoney(q.total_amount)}
                    </td>
                    <td className="text-right font-mono">
                      {q.total_amount_cdf && Number(q.total_amount_cdf) > 0
                        ? fmtMoney(q.total_amount_cdf)
                        : '—'}
                    </td>
                    <td>
                      {q.arsp === 'Enabled' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <TrendingUp className="h-3 w-3" />
                          {fmtMoney(q.arsp_amount)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        href={`/quotations/${q.id}`}
                        className="text-slate-500 hover:text-primary-600 p-1 inline-block"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(q.id)}
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

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="text-xl font-bold text-slate-900 truncate">{value}</div>
      </div>
    </div>
  );
}
