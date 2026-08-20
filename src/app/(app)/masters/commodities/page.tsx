'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

interface CommodityRow {
  id: number;
  commodity_name: string;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function CommoditiesPage() {
  const [items, setItems] = useState<CommodityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CommodityRow | null>(null);
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
      const res = await fetch(`/api/v1/commodities?${params}`);
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
    if (!confirm('Disable this commodity?')) return;
    const res = await fetch(`/api/v1/commodities/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This commodity could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The commodity has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Commodities</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Commodity
        </button>
      </div>

      <DataTable<CommodityRow>
        rows={items}
        loading={loading}
        rowKey={(c) => c.id}
        searchPlaceholder="Search commodity name..."
        emptyMessage="No commoditys yet — create the first one."
        columns={[
        { key: 'commodity_name', header: 'Commodity Name', sortable: true, className: 'font-medium' },
        ]}
        actions={(c) => ({ edit: () => setEditing(c), remove: () => handleDelete(c.id) })}
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
        <CommodityFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The commodity has been created.' });
          }}
        />
      )}

      {editing && (
        <CommodityFormModal
          commodity={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this commodity have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function CommodityFormModal({
  commodity,
  onClose,
  onSaved,
}: {
  commodity?: CommodityRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!commodity;
  const [name, setName] = useState(commodity?.commodity_name || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Skip the check while value is unchanged in edit mode — it would
  // always collide with itself otherwise.
  const checkValue = isEdit && name === commodity?.commodity_name ? '' : name;
  const { status, message } = useUniqueCheck({
    resource: 'commodities',
    value: checkValue,
    excludeId: commodity?.id ?? null,
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
      ? `/api/v1/commodities/${commodity!.id}`
      : '/api/v1/commodities';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commodity_name: name }),
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
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Commodity' : 'Create Commodity'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          <div>
            <label className="label required">Commodity Name</label>
            <input
              className="input uppercase"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              required
              maxLength={255}
            />
            <UniquenessIndicator status={status} message={message} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || status === 'taken'}
              className="btn-primary"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
