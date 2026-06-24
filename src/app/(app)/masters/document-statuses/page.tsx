'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, FileBadge, Plus, Search, Trash2, X } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

interface DocumentStatusRow {
  id: number;
  document_status: string;
  type: string;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

const TYPE_OPTIONS = [
  { value: '', label: 'All directions' },
  { value: 'I', label: 'Import (incl. IE/IU/IEU)' },
  { value: 'E', label: 'Export (incl. IE/EU/IEU)' },
  { value: 'U', label: 'Universal (incl. IU/EU/IEU)' },
];

// item_type-style 1-2 char direction codes.
const TYPE_LETTERS = [
  { value: 'I', label: 'Import' },
  { value: 'E', label: 'Export' },
  { value: 'U', label: 'Universal' },
];

function typeStringToSet(s: string): Set<string> {
  return new Set(s.split('').filter((c) => 'IEU'.includes(c)));
}

function typeSetToString(set: Set<string>): string {
  return ['I', 'E', 'U'].filter((c) => set.has(c)).join('');
}

export default function DocumentStatusesPage() {
  const [items, setItems] = useState<DocumentStatusRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
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
    if (!confirm('Disable this document status?')) return;
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
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileBadge className="h-6 w-6 text-primary-600" />
            Document Statuses
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Paperwork status for customs declarations. <code>type</code>
            is a 1-3 char direction code (I/E/U combinations) limiting
            which entities the status applies to.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Status
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
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
            className="input max-w-[260px]"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
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
                <th>Document Status</th>
                <th>Direction</th>
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
                items.map((d, idx) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-medium">{d.document_status}</td>
                    <td>
                      <code className="text-xs text-slate-600">{d.type}</code>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(d)}
                        className="text-slate-500 hover:text-primary-600 p-1"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(d.id)}
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
  const [types, setTypes] = useState<Set<string>>(
    status ? typeStringToSet(status.type) : new Set(['U']),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkValue = isEdit && name === status?.document_status ? '' : name;
  const { status: uniqueStatus, message: uniqueMessage } = useUniqueCheck({
    resource: 'document-statuses',
    value: checkValue,
    excludeId: status?.id ?? null,
  });

  function toggleType(letter: string, on: boolean) {
    setTypes((prev) => {
      const next = new Set(prev);
      if (on) next.add(letter);
      else next.delete(letter);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (types.size === 0) {
      setError('Pick at least one direction');
      setSaving(false);
      return;
    }

    const typeStr = typeSetToString(types);
    if (typeStr.length > 2) {
      setError('Type must be 1-2 characters (column limit)');
      setSaving(false);
      return;
    }

    const url = isEdit
      ? `/api/v1/document-statuses/${status!.id}`
      : '/api/v1/document-statuses';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_status: name, type: typeStr }),
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
            <label className="label">Document Status *</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="CRF Received"
            />
            <div className="mt-1 text-right">
              <UniquenessIndicator status={uniqueStatus} message={uniqueMessage} />
            </div>
          </div>
          <div>
            <label className="label">Direction *</label>
            <div className="flex gap-3">
              {TYPE_LETTERS.map((t) => (
                <label
                  key={t.value}
                  className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    checked={types.has(t.value)}
                    onChange={(e) => toggleType(t.value, e.target.checked)}
                  />
                  <span className="text-sm">
                    <code className="text-xs text-slate-500">{t.value}</code>{' '}
                    {t.label}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Stored as a 1-2 char string ({typeSetToString(types) || '—'}).
              Schema caps at 2 chars; common codes are I, E, U, IE, EU, IU.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving || uniqueStatus === 'taken'} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
