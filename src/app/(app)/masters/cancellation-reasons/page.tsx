'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

// §4.1 — why a tracking file was cancelled.
//
// Cancelling an Import, Export or Local file sets its Clearing Status to
// CANCELLED; the reason picked from this list is stored beside it, and the field
// only appears on those forms once CANCELLED is chosen (§4.12).
//
// A cancelled file stays claimable in a Payment Request — work was done and
// charges were incurred, and the cancellation is the moment somebody raises a
// request against it.

interface Row {
  id: number;
  reason_name: string;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function CancellationReasonsPage() {
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
      const res = await fetch(`/api/v1/cancellation-reasons?${params}`);
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
    if (!confirm('Disable this cancellation reason?')) return;
    const res = await fetch(`/api/v1/cancellation-reasons/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({
        status: 'error',
        title: 'Not deleted',
        message: json.error?.message || 'This reason could not be disabled.',
      });
      return;
    }
    // §4.27 — hidden, not destroyed: files already cancelled for this reason keep
    // pointing at it, so their history still reads correctly.
    setResult({
      status: 'success',
      title: 'Deleted',
      message: 'The reason has been disabled. Files already cancelled for it keep it on record.',
    });
    load();
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Cancellation Reasons</h1>
      </div>

      <DataTable<Row>
        exportHref={`/api/v1/masters/cancellation-reasons/export?q=${encodeURIComponent(search)}`}
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search reason..."
        emptyMessage="No cancellation reasons yet — create the first one."
        toolbar={
          // §4.35 — the create action belongs to the list it adds to.
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Reason
          </button>
        }
        columns={[
          { key: 'reason_name', header: 'Reason', sortable: true, className: 'font-medium' },
        ]}
        actions={(r) => ({ edit: () => setEditing(r), remove: () => handleDelete(r.id) })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => {
            setPageSize(n);
            setPage(1);
          },
          search,
          onSearchChange: (q) => {
            setSearch(q);
            setPage(1);
          },
        }}
      />

      {showCreate && (
        <FormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The reason has been created.' });
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
            setResult({ status: 'success', title: 'Saved', message: 'Your changes have been saved.' });
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
  const [name, setName] = useState(row?.reason_name || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkValue = isEdit && name === row?.reason_name ? '' : name;
  const { status, message } = useUniqueCheck({
    resource: 'cancellation-reasons',
    value: checkValue,
    excludeId: row?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'taken') {
      // §4.23 — name the field and the value.
      setError(`“${name.trim()}” is already a cancellation reason. Enter a different one.`);
      return;
    }
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/v1/cancellation-reasons/${row!.id}` : '/api/v1/cancellation-reasons';
    try {
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason_name: name }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(
          json.error?.message ||
            'This reason could not be saved. Check the wording and try again.',
        );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Cancellation Reason' : 'Create Cancellation Reason'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3 p-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}
          <div>
            {/* §4.18 — the star comes from the class, never typed into the text. */}
            <label className="label required">Reason</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              placeholder="e.g. Customs refused entry"
            />
            <UniquenessIndicator status={status} message={message} />
          </div>
          {/* §4.21 — a labelled way out, in every mode. */}
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
