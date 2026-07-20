'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Edit2,
  FileCog,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';

// /masters/forms — list of form definitions per root CLAUDE.md §4.5.
// Client-side pagination: form definitions are low-volume (dozens,
// not thousands) so one fetch fills the list and search stays local.

interface FormRow {
  id: number;
  form_key: string;
  name: string;
  description: string | null;
  entity_type: string;
}

export default function FormDefinitionsPage() {
  const [items, setItems] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/forms');
      const json = await res.json();
      if (json.ok) setItems(json.data as FormRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (f) =>
        f.form_key.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.entity_type.toLowerCase().includes(q),
    );
  }, [items, search]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalRows,
    totalPages,
    startIndex,
    paged,
    mounted,
    resetPage,
  } = usePagedList(filtered);

  async function handleDelete(row: FormRow) {
    if (
      !confirm(
        `Disable form definition "${row.form_key}"? Fields stay in place; ` +
          `the form disappears from the runtime until re-enabled in DB.`,
      )
    )
      return;
    const res = await fetch(`/api/v1/forms/${row.form_key}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!json.ok) {
      alert(json.error?.message || 'Delete failed');
      return;
    }
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileCog className="h-6 w-6 text-primary-600" />
            Form Definitions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dynamic forms drive create / edit screens across the app —
            license, invoice, credit-note, and more. Adding a field here
            makes it appear in every consumer that renders via{' '}
            <code className="text-xs">DynamicForm</code> without any code
            change.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" /> New Form
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search key, name, or entity..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Form Key</th>
                <th>Name</th>
                <th>Entity Type</th>
                <th>Description</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && paged.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-8">
                    No form definitions found
                  </td>
                </tr>
              )}
              {!loading &&
                paged.map((f, idx) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td>
                      <code className="text-xs text-slate-700">
                        {f.form_key}
                      </code>
                    </td>
                    <td className="font-medium">{f.name}</td>
                    <td>
                      <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {f.entity_type}
                      </span>
                    </td>
                    <td className="text-slate-600 text-sm max-w-md truncate">
                      {f.description ?? '—'}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        href={`/masters/forms/${f.form_key}`}
                        className="text-slate-500 hover:text-primary-600 p-1 inline-block"
                        title="Edit fields"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(f)}
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
          setPageSize={setPageSize}
          totalRows={totalRows}
          totalPages={totalPages}
          startIndex={startIndex}
          mounted={mounted}
        />
      </div>

      {showCreate && (
        <CreateFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </>
  );
}

function CreateFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [formKey, setFormKey] = useState('');
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/v1/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_key: formKey,
          name,
          entity_type: entityType,
          description: description || null,
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
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">Create Form Definition</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900"
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
            <label className="label">Form Key *</label>
            <input
              className="input"
              value={formKey}
              onChange={(e) => setFormKey(e.target.value)}
              required
              placeholder="license_default"
              pattern="[a-z][a-z0-9_-]*"
            />
            <p className="text-xs text-slate-500 mt-1">
              Stable slug. Code looks up forms by this key — treat it as
              permanent.
            </p>
          </div>
          <div>
            <label className="label">Entity Type *</label>
            <input
              className="input"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              required
              placeholder="license"
            />
            <p className="text-xs text-slate-500 mt-1">
              Binds this form to an entity (license, invoice, credit_note...).
            </p>
          </div>
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="License default form"
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — what this form is used for."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
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
