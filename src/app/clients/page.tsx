'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus, Search, Edit2, Trash2, FileSpreadsheet, Users,
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { Client } from '@/types';

const TYPE_BADGE = {
  I: { label: 'Import', cls: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  E: { label: 'Export', cls: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  L: { label: 'Local',  cls: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
} as const;

export default function ClientsListPage() {
  const [items, setItems] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clients');
      const json = await res.json();
      if (json.success) setItems(json.data);
    } catch {
      // ignore — list will be empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.company_name?.toLowerCase().includes(q) ||
      i.short_name?.toLowerCase().includes(q) ||
      (i.email ?? '').toLowerCase().includes(q) ||
      (i.contact_person ?? '').toLowerCase().includes(q) ||
      (i.phone ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } = usePagedList(filtered, { initialPageSize: 25 });

  function exportOne(id: number) {
    // Trigger CSV download via a hidden link; no need for a fetch + blob dance.
    window.location.href = `/api/clients/${id}/export`;
  }

  function exportAll() {
    window.location.href = '/api/clients/export-all';
  }

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>
      {/* ---- Page header ---- */}
      <div className="card p-4 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary-600" />
          Clients Management
        </h1>
      </div>

      {/* ---- "Client Details" collapsed card — links to /clients/new ---- */}
      <Link
        href="/clients/new"
        className="card p-4 mb-4 flex items-center justify-between hover:border-primary-300 hover:shadow-sm transition group"
      >
        <span className="flex items-center gap-2 text-slate-800 font-medium">
          <Users className="h-4 w-4 text-primary-600" />
          Client Details
        </span>
        <span className="flex items-center gap-1 text-xs text-primary-600 group-hover:text-primary-700">
          <Plus className="h-3.5 w-3.5" />
          New Client
        </span>
      </Link>

      {/* ---- List card ---- */}
      <div className="card">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-800">Clients List</span>
        </div>

        {/* Toolbar: page-size + search + Export All */}
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

          <div className="flex items-center gap-3 ml-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                className="input pl-9 text-sm w-64"
                placeholder="Search..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              />
            </div>
            <button
              type="button"
              onClick={exportAll}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium shadow-sm transition"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export All Clients
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Company Name</th>
                <th>Code</th>
                <th>Type</th>
                <th>Contact Person</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="text-center text-slate-500 py-8">Loading...</td></tr>
              )}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={9} className="text-center text-slate-500 py-8">
                  No clients yet — click <strong>New Client</strong> to create one.
                </td></tr>
              )}
              {!loading && paged.map((c, idx) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium">{c.company_name}</td>
                  <td className="font-mono text-xs">{c.short_name}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(c.client_type ?? '').split('').map((ch) => {
                        const meta = TYPE_BADGE[ch as keyof typeof TYPE_BADGE];
                        if (!meta) return null;
                        return (
                          <span
                            key={ch}
                            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium border ${meta.cls}`}
                          >
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="text-slate-700">{c.contact_person || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{c.email || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{c.phone || <span className="text-slate-300">—</span>}</td>
                  <td>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      c.display === 'Y'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {c.display === 'Y' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="inline-flex rounded-md shadow-sm overflow-hidden">
                      <Link
                        href={`/clients/${c.id}`}
                        title="Edit"
                        className="inline-flex items-center justify-center w-7 h-7 bg-primary-600 hover:bg-primary-700 text-white transition"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => exportOne(c.id)}
                        title="Export to CSV"
                        className="inline-flex items-center justify-center w-7 h-7 bg-emerald-600 hover:bg-emerald-700 text-white transition"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Delete (not yet wired)"
                        disabled
                        className="inline-flex items-center justify-center w-7 h-7 bg-red-500 opacity-60 text-white cursor-not-allowed"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
