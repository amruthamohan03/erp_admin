'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

interface Row {
  id: number;
  incoterm_short_name: string;
  incoterm_full_name: string;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function IncotermsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/v1/incoterms?${params}`);
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
    if (!confirm('Disable this incoterm?')) return;
    const res = await fetch(`/api/v1/incoterms/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This incoterm could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The incoterm has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Incoterms</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Incoterm
        </button>
      </div>

      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search code or description..."
        emptyMessage="No incoterms yet — create the first one."
        columns={[
        { key: 'incoterm_short_name', header: 'Code', sortable: true, className: 'font-mono font-medium align-top' },
        { key: 'incoterm_full_name', header: 'Description', sortable: true, className: 'text-sm text-foreground' },
        ]}
        actions={(r) => ({ edit: () => setEditing(r), remove: () => handleDelete(r.id) })}
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

      {showCreate && (
        <FormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The incoterm has been created.' });
          }}
        />
      )}

      {editing && (
        <FormModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this incoterm have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormModal({
  row,
  onClose,
  onSaved,
}: {
  row?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [shortName, setShortName] = useState(row?.incoterm_short_name || '');
  const [fullName, setFullName] = useState(row?.incoterm_full_name || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkValue = isEdit && shortName === row?.incoterm_short_name ? '' : shortName;
  const { status, message } = useUniqueCheck({
    resource: 'incoterms',
    value: checkValue,
    excludeId: row?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'taken') {
      setError('Already exists');
      return;
    }
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/v1/incoterms/${row!.id}`
      : '/api/v1/incoterms';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incoterm_short_name: shortName,
          incoterm_full_name: fullName,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || 'Save failed');
        return;
      }
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Incoterm' : 'Create Incoterm'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">
              {error}
            </div>
          )}
          <div>
            <label className="label required">Code</label>
            <input
              className="input uppercase font-mono"
              value={shortName}
              onChange={(e) => setShortName(e.target.value.toUpperCase())}
              required
              maxLength={10}
            />
            <UniquenessIndicator status={status} message={message} />
          </div>
          <div>
            <label className="label required">Description</label>
            <textarea
              className="input min-h-[120px]"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              maxLength={250}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving || status === 'taken'} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
