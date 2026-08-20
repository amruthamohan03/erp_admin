'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building, Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

interface MainOfficeRow {
  id: number;
  main_location_name: string | null;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function MainOfficesPage() {
  const [items, setItems] = useState<MainOfficeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<MainOfficeRow | null>(null);
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
      const res = await fetch(`/api/v1/main-offices?${params}`);
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
    if (!confirm('Disable this main office? References from seal batches stay intact.')) return;
    const res = await fetch(`/api/v1/main-offices/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This main office could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The main office has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building className="h-6 w-6 text-primary-600" />
            Main Offices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Regional / head offices that own seal purchase batches. Distinct
            from <code>office_location_master_t</code> (client issuing office)
            and <code>sub_office_master_t</code> (customs declaration desk).
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Main Office
        </button>
      </div>

      <DataTable<MainOfficeRow>
        rows={items}
        loading={loading}
        rowKey={(o) => o.id}
        searchPlaceholder="Search main location name..."
        emptyMessage="No main offices yet — create the first one."
        columns={[
        { key: 'main_location_name', header: 'Main Office', className: 'font-medium', render: (o: MainOfficeRow) => (
            <>
            {o.main_location_name || '—'}
            </>
          ) },
        { key: 'display', header: 'Status', render: (o: MainOfficeRow) => (
            <>
            <span
                        className={
                          o.display === 'Y'
                            ? 'inline-block rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700'
                            : 'inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-muted-foreground'
                        }
                      >
                        {o.display === 'Y' ? 'Active' : 'Disabled'}
                      </span>
            </>
          ) },
        ]}
        actions={(o) => ({ edit: () => setEditing(o), remove: () => handleDelete(o.id) })}
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
        <MainOfficeFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The main office has been created.' });
          }}
        />
      )}

      {editing && (
        <MainOfficeFormModal
          office={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this main office have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function MainOfficeFormModal({
  office,
  onClose,
  onSaved,
}: {
  office?: MainOfficeRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!office;
  const [name, setName] = useState(office?.main_location_name || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Skip the check while value is unchanged in edit mode — it would
  // always collide with itself otherwise.
  const checkValue =
    isEdit && name === office?.main_location_name ? '' : name;
  const { status, message } = useUniqueCheck({
    resource: 'main-offices',
    value: checkValue,
    excludeId: office?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/v1/main-offices/${office!.id}`
      : '/api/v1/main-offices';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ main_location_name: name }),
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
            {isEdit ? 'Edit Main Office' : 'Create Main Office'}
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
            <label className="label required">Main Location Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={255}
              placeholder="e.g. Kinshasa HQ"
            />
            <div className="mt-1 text-right">
              <UniquenessIndicator status={status} message={message} />
            </div>
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
