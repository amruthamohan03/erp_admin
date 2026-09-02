'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';

interface TransportModeRow {
  id: number;
  transport_mode_name: string;
  transport_letter: string;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function TransportModesPage() {
  const [items, setItems] = useState<TransportModeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<TransportModeRow | null>(null);
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
      const res = await fetch(`/api/v1/transport-modes?${params}`);
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
    if (!confirm('Disable this transport mode?')) return;
    const res = await fetch(`/api/v1/transport-modes/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This transport mode could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The transport mode has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Transport Modes</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Transport Mode
        </button>
      </div>

      <DataTable<TransportModeRow>
        rows={items}
        loading={loading}
        rowKey={(t) => t.id}
        searchPlaceholder="Search mode name, letter..."
        emptyMessage="No transport modes yet — create the first one."
        columns={[
        { key: 'transport_mode_name', header: 'Mode Name', sortable: true, className: 'font-medium' },
        { key: '5', header: 'Letter', className: 'inline-block rounded bg-muted px-2 py-0.5 text-xs text-foreground font-mono', render: (t: TransportModeRow) => (
            <>
            <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs text-foreground font-mono">
                        {t.transport_letter}
                      </span>
            </>
          ) },
        ]}
        actions={(t) => ({ edit: () => setEditing(t), remove: () => handleDelete(t.id) })}
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
        <TransportModeFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The transport mode has been created.' });
          }}
        />
      )}

      {editing && (
        <TransportModeFormModal
          mode={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this transport mode have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function TransportModeFormModal({
  mode,
  onClose,
  onSaved,
}: {
  mode?: TransportModeRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!mode;
  const [name, setName] = useState(mode?.transport_mode_name || '');
  const [letter, setLetter] = useState(mode?.transport_letter || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/v1/transport-modes/${mode!.id}`
      : '/api/v1/transport-modes';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transport_mode_name: name,
          transport_letter: letter,
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
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Transport Mode' : 'Create Transport Mode'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
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
            <label className="label required">Mode Name</label>
            <input
              className="input uppercase"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              required
              maxLength={100}
            />
          </div>
          <div>
            <label className="label required">Transport Letter</label>
            <input
              className="input uppercase"
              value={letter}
              onChange={(e) => setLetter(e.target.value.toUpperCase())}
              required
              maxLength={5}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
