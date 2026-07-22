'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
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
  I: 'bg-blue-100 text-blue-700',
  E: 'bg-emerald-100 text-emerald-700',
  IE: 'bg-violet-100 text-violet-700',
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
        <h1 className="text-2xl font-bold text-slate-900">Document Statuses</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Status
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search status..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input max-w-[200px]"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as '' | DocumentStatusType);
              setPage(1);
            }}
          >
            <option value="">All Types</option>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Status</th>
                <th className="w-32">Type</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-500 py-8">
                    No document statuses found
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-medium">{item.document_status}</td>
                    <td>
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TYPE_BADGE_STYLE[item.type]}`}
                      >
                        {TYPE_LABEL[item.type]}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => setEditing(item)}
                        className="text-slate-500 hover:text-primary-600 p-1"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
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

      {showCreate && (
        <DocumentStatusFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
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
          }}
        />
      )}
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
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Document Status' : 'Create Document Status'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
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
            <label className="label">Status *</label>
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
            <label className="label">Type *</label>
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as DocumentStatusType)}
              required
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
