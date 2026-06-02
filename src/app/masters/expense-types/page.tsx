'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import UniqueAvailability from '@/components/ui/UniqueAvailability';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import Toggle from '@/components/ui/Toggle';
import type { ExpenseType } from '@/types';

type CategoryKey = 'is_import' | 'is_export' | 'is_local' | 'is_advance' | 'is_other';

const CATEGORIES: { key: CategoryKey; label: string; short: string; badgeClass: string }[] = [
  { key: 'is_import', label: 'Import', short: 'IMP', badgeClass: 'bg-blue-100 text-blue-700' },
  { key: 'is_export', label: 'Export', short: 'EXP', badgeClass: 'bg-emerald-100 text-emerald-700' },
  { key: 'is_local', label: 'Local', short: 'LOC', badgeClass: 'bg-amber-100 text-amber-700' },
  { key: 'is_advance', label: 'Advance', short: 'ADV', badgeClass: 'bg-violet-100 text-violet-700' },
  { key: 'is_other', label: 'Other', short: 'OTH', badgeClass: 'bg-slate-200 text-slate-700' },
];

export default function ExpenseTypesPage() {
  const [items, setItems] = useState<ExpenseType[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryKey | ''>('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ExpenseType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/expense-types');
      const json = await res.json();
      if (json.success) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (categoryFilter && !it[categoryFilter]) return false;
      if (!q) return true;
      return it.expense_type_name?.toLowerCase().includes(q);
    });
  }, [items, search, categoryFilter]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } = usePagedList(filtered);

  async function handleDelete(id: number) {
    if (!confirm('Disable this expense type?')) return;
    const res = await fetch(`/api/expense-types/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) { alert(json.message || 'Failed'); return; }
    load();
  }

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Expense Types</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Expense Type
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search expense type name..." value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          </div>
          <select className="input max-w-[200px]" value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value as CategoryKey | ''); resetPage(); }}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
          </select>
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
              {loading && (<tr><td colSpan={4} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (<tr><td colSpan={4} className="text-center text-slate-500 py-8">No expense types found</td></tr>)}
              {!loading && paged.map((it, idx) => (
                <tr key={it.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium">{it.expense_type_name}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {CATEGORIES.filter((c) => it[c.key]).map((c) => (
                        <span key={c.key} className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${c.badgeClass}`}>
                          {c.short}
                        </span>
                      ))}
                      {CATEGORIES.every((c) => !it[c.key]) && (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="text-right">
                    <button onClick={() => setEditing(it)} className="text-slate-500 hover:text-primary-600 p-1" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(it.id)} className="text-slate-500 hover:text-red-600 p-1 ml-1" title="Disable">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationFooter page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}
          totalRows={totalRows} totalPages={totalPages} startIndex={startIndex} mounted={mounted} />
      </div>

      {showCreate && (<ExpenseTypeFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />)}
      {editing && (<ExpenseTypeFormModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />)}
    </DashboardShell>
  );
}

function ExpenseTypeFormModal({
  item, onClose, onSaved,
}: { item?: ExpenseType; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    expense_type_name: item?.expense_type_name || '',
    is_import: item?.is_import ?? false,
    is_export: item?.is_export ?? false,
    is_local: item?.is_local ?? false,
    is_advance: item?.is_advance ?? false,
    is_other: item?.is_other ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unique = useUniqueCheck({
    endpoint: '/api/uniqueness/expense-types',
    value: form.expense_type_name,
    excludeId: item?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (unique.status === 'taken') { setError('Already exists'); return; }
    setSaving(true); setError(null);
    const url = isEdit ? `/api/expense-types/${item!.id}` : '/api/expense-types';
    const method = isEdit ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.message || 'Save failed'); return; }
      onSaved();
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit Expense Type' : 'Create Expense Type'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-4">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div>
            <label className="label">Expense Type Name *</label>
            <input className="input uppercase" value={form.expense_type_name}
              onChange={(e) => setForm({ ...form, expense_type_name: e.target.value.toUpperCase() })} required maxLength={300} />
            <UniqueAvailability status={unique.status} message={unique.message} />
          </div>
          <div>
            <label className="label">Categories</label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              {CATEGORIES.map((c) => (
                <Toggle
                  key={c.key}
                  checked={form[c.key]}
                  onChange={(v) => setForm({ ...form, [c.key]: v })}
                  label={c.label}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || unique.status === 'taken'} className="btn-primary">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
