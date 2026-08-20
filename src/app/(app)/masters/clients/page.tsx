'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import RecordViewModal from '@/components/transactional/RecordViewModal';

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

  // Read-only details modal — null when closed, else the row id to view.
  const [viewId, setViewId] = useState<number | null>(null);
  // §4.22 — the acknowledged outcome of a delete. Create and edit happen on the
  // transaction page, which reports its own result.
  const [result, setResult] = useState<SaveResult | null>(null);

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
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This client could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The client has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-6 w-6 text-primary-600" />
          Clients
        </h1>
        <Link href="/masters/clients/new" className="btn-primary">
          <Plus className="h-4 w-4" /> New Client
        </Link>
      </div>

      <DataTable<ClientRow>
        rows={items}
        loading={loading}
        rowKey={(c) => c.id}
        searchPlaceholder="Search company, code, contact, email, phone..."
        exportHref={`/api/v1/clients/export?${new URLSearchParams({ q: search }).toString()}`}
        emptyMessage={
          <>
            No clients yet.{' '}
            <Link href="/masters/clients/new" className="text-primary-600 hover:underline">
              Create the first one.
            </Link>
          </>
        }
        columns={[
          {
            key: 'company_name',
            header: 'Company Name',
            sortable: true,
            render: (c) => (
              <Link href={`/masters/clients/${c.id}`} className="font-medium text-foreground hover:text-primary-600">
                {c.company_name}
              </Link>
            ),
          },
          {
            key: 'short_name',
            header: 'Code',
            sortable: true,
            render: (c) => (
              <Link href={`/masters/clients/${c.id}`} className="font-mono text-xs text-primary-600 hover:underline">
                {c.short_name}
              </Link>
            ),
          },
          {
            key: 'client_type',
            header: 'Type',
            render: (c) => (
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
            ),
          },
          { key: 'contact_person', header: 'Contact Person' },
          { key: 'email', header: 'Email' },
          { key: 'phone', header: 'Phone' },
        ]}
        actions={(c) => ({
          view: () => setViewId(c.id),
          edit: `/masters/clients/${c.id}`,
          remove: () => handleDelete(c.id),
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
          slug="clients"
          entityId={viewId}
          editHref={`/masters/clients/${viewId}`}
          onClose={() => setViewId(null)}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
