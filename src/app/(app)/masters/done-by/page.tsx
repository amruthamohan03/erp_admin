'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import Toggle from '@/components/ui/Toggle';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

interface Row {
  id: number;
  done_by_name: string;
  /** Marks the entry that stands for our own company (renders as the project name). */
  is_company: boolean;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function DoneByPage() {
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
      const res = await fetch(`/api/v1/done-by?${params}`);
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
    if (!confirm('Disable this entry?')) return;
    const res = await fetch(`/api/v1/done-by/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This entry could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The entry has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Done By</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Done By
        </button>
      </div>

      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search done by name..."
        emptyMessage="No attributions yet — create the first one."
        columns={[
        { key: 'done_by_name', header: 'Done By', className: 'font-medium', render: (r: Row) => (
            <>
            {r.done_by_name}
                      {r.is_company && (
                        <span className="ms-2 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                          Our company
                        </span>
                      )}
            </>
          ) },
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
            setResult({ status: 'success', title: 'Created', message: 'The entry has been created.' });
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
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this entry have been saved.' });
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
  const [name, setName] = useState(row?.done_by_name || '');
  const [isCompany, setIsCompany] = useState(row?.is_company ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Skip the check while value is unchanged in edit mode — it would
  // always collide with itself otherwise. The company row's name is not editable
  // at all, so it never needs checking.
  const checkValue = isCompany || (isEdit && name === row?.done_by_name) ? '' : name;
  const { status, message } = useUniqueCheck({
    resource: 'done-by',
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

    const url = isEdit ? `/api/v1/done-by/${row!.id}` : '/api/v1/done-by';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        // The company row's label comes from branding, so the server rejects a
        // name alongside the flag — send only what it will accept.
        body: JSON.stringify(
          isCompany ? { is_company: true } : { done_by_name: name, ...(isEdit ? { is_company: false } : {}) },
        ),
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
            {isEdit ? 'Edit Done By' : 'Create Done By'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-slate-900"
          >
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
            <label className="label required">Done By Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required={!isCompany}
              disabled={isCompany}
              maxLength={50}
            />
            {isCompany ? (
              <p className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground">
                Shown as the project name from Settings → Application. Rename it there.
              </p>
            ) : (
              <UniquenessIndicator status={status} message={message} />
            )}
          </div>

          {/* §4.1 — which entry means "our company" is configuration, not a
              hardcoded id. Marking it here makes its label follow the project
              name everywhere it is offered. */}
          {isEdit && (
            <div className="rounded-md border border-border p-2">
              <Toggle
                checked={isCompany}
                onChange={setIsCompany}
                label="This entry is our own company"
              />
              <p className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground">
                Only one entry can be the company. It displays as the configured project name
                instead of stored text.
              </p>
            </div>
          )}
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
