'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

type DocumentStatusType = 'I' | 'E' | 'IE';

interface DocumentStatusRow {
  id: number;
  document_status: string;
  type: DocumentStatusType;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

const TYPE_OPTIONS: { value: DocumentStatusType; label: string }[] = [
  { value: 'I', label: 'Import' },
  { value: 'E', label: 'Export' },
  { value: 'IE', label: 'Both (Import/Export)' },
];

const TYPE_LABEL: Record<DocumentStatusType, string> = {
  I: 'Import',
  E: 'Export',
  IE: 'Both',
};

const TYPE_BADGE_STYLE: Record<DocumentStatusType, string> = {
  I: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
  E: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  IE: 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300',
};

export default function DocumentStatusesPage() {
  const [items, setItems] = useState<DocumentStatusRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | DocumentStatusType>('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<DocumentStatusRow | null>(null);
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
      if (typeFilter) params.set('type', typeFilter);
      const res = await fetch(`/api/v1/document-statuses?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, typeFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Disable this status?')) return;
    const res = await fetch(`/api/v1/document-statuses/${id}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This status could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The status has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Document Statuses</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Status
        </button>
      </div>

      <DataTable<DocumentStatusRow>
        rows={items}
        loading={loading}
        rowKey={(item) => item.id}
        searchPlaceholder="Search status..."
        emptyMessage="No document statuss yet — create the first one."
        columns={[
        { key: 'document_status', header: 'Status', sortable: true, className: 'font-medium' },
        { key: '5', header: 'Type', render: (item: DocumentStatusRow) => (
            <>
            <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TYPE_BADGE_STYLE[item.type]}`}
                      >
                        {TYPE_LABEL[item.type]}
                      </span>
            </>
          ) },
        ]}
        actions={(item) => ({ edit: () => setEditing(item), remove: () => handleDelete(item.id) })}
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
        <DocumentStatusFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The status has been created.' });
          }}
        />
      )}

      {editing && (
        <DocumentStatusFormModal
          status={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this status have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function DocumentStatusFormModal({
  status,
  onClose,
  onSaved,
}: {
  status?: DocumentStatusRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!status;
  const [name, setName] = useState(status?.document_status || '');
  const [type, setType] = useState<DocumentStatusType>(status?.type || 'I');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkValue = isEdit && name === status?.document_status ? '' : name;
  const { status: uniqueStatus, message: uniqueMessage } = useUniqueCheck({
    resource: 'document-statuses',
    value: checkValue,
    excludeId: status?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (uniqueStatus === 'taken') {
      setError('Already exists');
      return;
    }
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/v1/document-statuses/${status!.id}`
      : '/api/v1/document-statuses';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_status: name, type }),
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
            {isEdit ? 'Edit Document Status' : 'Create Document Status'}
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
            <label className="label required">Status</label>
            <input
              className="input uppercase"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              required
              maxLength={300}
            />
            <UniquenessIndicator status={uniqueStatus} message={uniqueMessage} />
          </div>
          <div>
            <label className="label required">Type</label>
            <SearchableSelect
              value={type}
              required
              options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => setType(v as DocumentStatusType)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uniqueStatus === 'taken'}
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
