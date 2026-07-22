'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Edit2, Plus, Search, Trash2, Users } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';

interface ClientRow {
  id: number;
  company_name: string;
  short_name: string;
  client_type: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

const TYPE_BADGE = {
  I: { label: 'Import', cls: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  E: { label: 'Export', cls: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  L: { label: 'Local', cls: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
} as const;

export default function ClientsPage() {
  const [items, setItems] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/v1/clients?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (
      !confirm(
        'Disable this client? Existing licenses/invoices stay intact.',
      )
    ) {
      return;
    }
    const res = await fetch(`/api/v1/clients/${id}`, { method: 'DELETE' });
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
          <Users className="h-6 w-6 text-primary-600" />
          Clients
        </h1>
        <div className="flex items-center gap-2">
          <a
            href={`/api/v1/clients/export?${new URLSearchParams({
              q: search,
            }).toString()}`}
            className="btn-secondary"
            title="Download current view as XLSX"
          >
            <Download className="h-4 w-4" /> Export
          </a>
          <Link href="/masters/clients/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New Client
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search company, code, contact, email, phone..."
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
                <th className="w-16">#</th>
                <th>Company Name</th>
                <th>Code</th>
                <th>Type</th>
                <th>Contact Person</th>
                <th>Email</th>
                <th>Phone</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500 py-8">
                    No clients found.{' '}
                    <Link
                      href="/masters/clients/new"
                      className="text-primary-600 hover:underline"
                    >
                      Create one.
                    </Link>
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((c, idx) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td>
                      <Link
                        href={`/masters/clients/${c.id}`}
                        className="font-medium text-slate-900 hover:text-primary-600"
                      >
                        {c.company_name}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/masters/clients/${c.id}`}
                        className="font-mono text-xs text-primary-600 hover:underline"
                      >
                        {c.short_name}
                      </Link>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {(c.client_type ?? '').split('').map((ch) => {
                          const meta =
                            TYPE_BADGE[ch as keyof typeof TYPE_BADGE];
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
                    <td>{c.contact_person || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        href={`/masters/clients/${c.id}`}
                        className="text-slate-500 hover:text-primary-600 p-1 inline-block"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-slate-500 hover:text-red-600 p-1 ml-1"
                        title="Disable"
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
