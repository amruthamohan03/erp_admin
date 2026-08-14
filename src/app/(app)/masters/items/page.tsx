'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import PaginationFooter from '@/components/ui/PaginationFooter';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';

interface ItemRow {
  id: number;
  item_name: string;
  item_code: string | null;
  category_id: number | null;
  category_name: string | null;
  tax_not_tax: string;
  percentage: string;
  item_type: string;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

interface CategoryOption {
  id: number;
  category_name: string;
}

const ITEM_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'I', label: 'Import' },
  { value: 'E', label: 'Export' },
  { value: 'U', label: 'Universal' },
  { value: 'IE', label: 'Import & Export' },
  { value: 'IU', label: 'Import & Universal' },
  { value: 'EU', label: 'Export & Universal' },
  { value: 'IEU', label: 'All (I/E/U)' },
];
const ITEM_TYPE_LABEL: Record<string, string> = {
  I: 'Import', E: 'Export', U: 'Universal',
  IE: 'Import & Export', IU: 'Import & Universal', EU: 'Export & Universal', IEU: 'All',
};
const TAX_CLASS_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M', 'O', 'P'];

export default function ItemsPage() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Categories for the picker — small list, fetch once.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/quotation-categories?pageSize=100')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) {
          setCategories(
            (j.data as Array<{ id: number; category_name: string }>).map((c) => ({
              id: c.id,
              category_name: c.category_name,
            })),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (categoryFilter) params.set('category_id', categoryFilter);
      if (typeFilter) params.set('item_type', typeFilter);
      const res = await fetch(`/api/v1/items?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, categoryFilter, typeFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Disable this item?')) return;
    const res = await fetch(`/api/v1/items/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This item could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The item has been disabled.' });
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Items</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Item
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              className="input pl-9"
              placeholder="Search item name or code..."
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
            value={categoryFilter}
            emptyLabel="All Categories"
            placeholder="All Categories"
            options={categories.map((c) => ({ value: String(c.id), label: c.category_name }))}
            onChange={(v) => {
              setCategoryFilter(v);
              setPage(1);
            }}
          />
          <SearchableSelect
            className="max-w-[200px]"
            aria-label="Filter by type"
            value={typeFilter}
            emptyLabel="All Types"
            placeholder="All Types"
            options={ITEM_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Item Name</th>
                <th className="w-24">Code</th>
                <th className="w-48">Category</th>
                <th className="w-40">Type</th>
                <th className="w-20 text-center">Tax Class</th>
                <th className="w-20 text-right">%</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="text-center text-muted-foreground py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-muted-foreground py-8">
                    No items found
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="text-muted-foreground font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-medium">{r.item_name}</td>
                    <td className="text-slate-600 text-xs">
                      {r.item_code || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="text-slate-700 text-xs">
                      {r.category_name || <span className="text-slate-300">—</span>}
                    </td>
                    <td>
                      <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
                        {ITEM_TYPE_LABEL[r.item_type] ?? r.item_type}
                      </span>
                    </td>
                    <td className="text-center text-slate-700 text-xs font-mono">
                      {r.tax_not_tax}
                    </td>
                    <td className="text-right text-slate-700 text-xs">
                      {r.percentage != null ? Number(r.percentage).toFixed(2) : '0.00'}
                    </td>
                    <td className="text-right">
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
        <ItemFormModal
          categories={categories}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The item has been created.' });
          }}
        />
      )}

      {editing && (
        <ItemFormModal
          categories={categories}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this item have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function ItemFormModal({
  categories,
  item,
  onClose,
  onSaved,
}: {
  categories: CategoryOption[];
  item?: ItemRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    item_name: item?.item_name || '',
    item_code: item?.item_code || '',
    category_id: item?.category_id != null ? String(item.category_id) : '',
    tax_not_tax: item?.tax_not_tax || 'A',
    percentage: item?.percentage != null ? String(item.percentage) : '0',
    item_type: item?.item_type || 'I',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const url = isEdit ? `/api/v1/items/${item!.id}` : '/api/v1/items';
    const method = isEdit ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: form.item_name,
          item_code: form.item_code || null,
          category_id: form.category_id ? Number(form.category_id) : null,
          tax_not_tax: form.tax_not_tax,
          percentage: Number(form.percentage) || 0,
          item_type: form.item_type,
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
          <h2 className="font-semibold">{isEdit ? 'Edit Item' : 'Create Item'}</h2>
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
            <label className="label required">Item Name</label>
            <input
              className="input"
              value={form.item_name}
              onChange={(e) => setForm({ ...form, item_name: e.target.value })}
              required
              maxLength={255}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Item Code</label>
              <input
                className="input"
                value={form.item_code}
                onChange={(e) => setForm({ ...form, item_code: e.target.value })}
                maxLength={50}
              />
            </div>
            <div>
              <label className="label">Category</label>
              <SearchableSelect
                aria-label="Category"
                value={form.category_id}
                emptyLabel="— Select —"
                placeholder="— Select —"
                options={categories.map((c) => ({ value: String(c.id), label: c.category_name }))}
                onChange={(v) => setForm({ ...form, category_id: v })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label required">Type</label>
              <SearchableSelect
                aria-label="Type"
                required
                value={form.item_type}
                options={ITEM_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => setForm({ ...form, item_type: v })}
              />
            </div>
            <div>
              <label className="label required">Tax Class</label>
              <SearchableSelect
                aria-label="Tax class"
                required
                value={form.tax_not_tax}
                options={TAX_CLASS_OPTIONS.map((c) => ({ value: c, label: c }))}
                onChange={(v) => setForm({ ...form, tax_not_tax: v })}
              />
            </div>
            <div>
              <label className="label">Percentage</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: e.target.value })}
              />
            </div>
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
