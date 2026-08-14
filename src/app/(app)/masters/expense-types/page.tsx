'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import SearchableSelect from '@/components/ui/SearchableSelect';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import Toggle from '@/components/ui/Toggle';

interface Row {
  id: number;
  expense_type_name: string;
  is_import: boolean;
  is_export: boolean;
  is_local: boolean;
  is_advance: boolean;
  is_other: boolean;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

type CategoryKey =
  | 'is_import'
  | 'is_export'
  | 'is_local'
  | 'is_advance'
  | 'is_other';

const CATEGORIES: {
  key: CategoryKey;
  label: string;
  short: string;
  badgeClass: string;
}[] = [
  { key: 'is_import', label: 'Import', short: 'IMP', badgeClass: 'bg-blue-100 text-blue-700' },
  { key: 'is_export', label: 'Export', short: 'EXP', badgeClass: 'bg-emerald-100 text-emerald-700' },
  { key: 'is_local', label: 'Local', short: 'LOC', badgeClass: 'bg-amber-100 text-amber-700' },
  { key: 'is_advance', label: 'Advance', short: 'ADV', badgeClass: 'bg-violet-100 text-violet-700' },
  { key: 'is_other', label: 'Other', short: 'OTH', badgeClass: 'bg-slate-200 text-slate-700' },
];

export default function ExpenseTypesPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [flagFilter, setFlagFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

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
      if (flagFilter) params.set('flag', flagFilter);
      const res = await fetch(`/api/v1/expense-types?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, flagFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Disable this expense type?')) return;
    const res = await fetch(`/api/v1/expense-types/${id}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This expense type could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The expense type has been disabled.' });
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Expense Types</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Expense Type
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              className="input pl-9"
              placeholder="Search expense type name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <SearchableSelect
            className="max-w-[200px]"
            aria-label="Filter by category"
            value={flagFilter}
            emptyLabel="All Categories"
            placeholder="All Categories"
            options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
            onChange={(v) => {
              setFlagFilter(v);
              setPage(1);
            }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Expense Type</th>
                <th className="w-64">Categories</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-8">
                    No expense types found
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="text-muted-foreground font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-medium">{r.expense_type_name}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {CATEGORIES.filter((c) => r[c.key]).map((c) => (
                          <span
                            key={c.key}
                            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${c.badgeClass}`}
                          >
                            {c.short}
                          </span>
                        ))}
                        {CATEGORIES.every((c) => !r[c.key]) && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(r)}
                        className="ico-edit"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="ico-delete ml-1"
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
        <FormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The expense type has been created.' });
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
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this expense type have been saved.' });
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
  const [name, setName] = useState(row?.expense_type_name || '');
  const [flags, setFlags] = useState<Record<CategoryKey, boolean>>({
    is_import: row?.is_import ?? false,
    is_export: row?.is_export ?? false,
    is_local: row?.is_local ?? false,
    is_advance: row?.is_advance ?? false,
    is_other: row?.is_other ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkValue = isEdit && name === row?.expense_type_name ? '' : name;
  const { status, message } = useUniqueCheck({
    resource: 'expense-types',
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
      ? `/api/v1/expense-types/${row!.id}`
      : '/api/v1/expense-types';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_type_name: name,
          ...flags,
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
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Expense Type' : 'Create Expense Type'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          <div>
            <label className="label required">Expense Type Name</label>
            <input
              className="input uppercase"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              required
              maxLength={300}
            />
            <UniquenessIndicator status={status} message={message} />
          </div>
          <div>
            <label className="label">Categories</label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              {CATEGORIES.map((c) => (
                <Toggle
                  key={c.key}
                  checked={flags[c.key]}
                  onChange={(v) =>
                    setFlags((prev) => ({ ...prev, [c.key]: v }))
                  }
                  label={c.label}
                />
              ))}
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
