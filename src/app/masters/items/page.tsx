'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { Item, ItemType, ItemTaxClass, QuotationCategory } from '@/types';

const ITEM_TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: 'I', label: 'Import' },
  { value: 'E', label: 'Export' },
  { value: 'U', label: 'Universal' },
  { value: 'IE', label: 'Import & Export' },
  { value: 'IU', label: 'Import & Universal' },
  { value: 'EU', label: 'Export & Universal' },
  { value: 'IEU', label: 'All (I/E/U)' },
];
const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  I: 'Import', E: 'Export', U: 'Universal',
  IE: 'Import & Export', IU: 'Import & Universal', EU: 'Export & Universal', IEU: 'All',
};
const TAX_CLASS_OPTIONS: ItemTaxClass[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M', 'O', 'P'];

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<QuotationCategory[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | ItemType>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/items');
      const json = await res.json();
      if (json.success) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    const res = await fetch('/api/quotation-categories');
    const json = await res.json();
    if (json.success) setCategories(json.data);
  }, []);

  useEffect(() => { load(); loadCategories(); }, [load, loadCategories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (typeFilter && r.item_type !== typeFilter) return false;
      if (categoryFilter && String(r.category_id) !== categoryFilter) return false;
      if (!q) return true;
      return r.item_name?.toLowerCase().includes(q) || (r.item_code ?? '').toLowerCase().includes(q);
    });
  }, [items, search, typeFilter, categoryFilter]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } = usePagedList(filtered);

  async function handleDelete(id: number) {
    if (!confirm('Disable this item?')) return;
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) { alert(json.message || 'Failed'); return; }
    load();
  }

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Items</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Item
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search item name or code..." value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          </div>
          <select className="input max-w-[200px]" value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); resetPage(); }}>
            <option value="">All Categories</option>
            {categories.map((c) => (<option key={c.id} value={c.id}>{c.category_name}</option>))}
          </select>
          <select className="input max-w-[200px]" value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as '' | ItemType); resetPage(); }}>
            <option value="">All Types</option>
            {ITEM_TYPE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
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
              {loading && (<tr><td colSpan={8} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (<tr><td colSpan={8} className="text-center text-slate-500 py-8">No items found</td></tr>)}
              {!loading && paged.map((r, idx) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium">{r.item_name}</td>
                  <td className="text-slate-600 text-xs">{r.item_code || <span className="text-slate-300">—</span>}</td>
                  <td className="text-slate-700 text-xs">{r.category_name || <span className="text-slate-300">—</span>}</td>
                  <td>
                    <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
                      {ITEM_TYPE_LABEL[r.item_type] ?? r.item_type}
                    </span>
                  </td>
                  <td className="text-center text-slate-700 text-xs font-mono">{r.tax_not_tax}</td>
                  <td className="text-right text-slate-700 text-xs">
                    {r.percentage != null ? Number(r.percentage).toFixed(2) : '0.00'}
                  </td>
                  <td className="text-right">
                    <button onClick={() => setEditing(r)} className="text-slate-500 hover:text-primary-600 p-1" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="text-slate-500 hover:text-red-600 p-1 ml-1" title="Disable">
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

      {showCreate && (<ItemFormModal categories={categories} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />)}
      {editing && (<ItemFormModal item={editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />)}
    </DashboardShell>
  );
}

function ItemFormModal({
  item, categories, onClose, onSaved,
}: { item?: Item; categories: QuotationCategory[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    item_name: item?.item_name || '',
    item_code: item?.item_code || '',
    category_id: item?.category_id ? String(item.category_id) : '',
    tax_not_tax: (item?.tax_not_tax || 'A') as ItemTaxClass,
    percentage: item?.percentage != null ? String(item.percentage) : '0',
    item_type: (item?.item_type || 'I') as ItemType,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const url = isEdit ? `/api/items/${item!.id}` : '/api/items';
    const method = isEdit ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
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
      if (!res.ok || !json.success) { setError(json.message || 'Save failed'); return; }
      onSaved();
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit Item' : 'Create Item'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div>
            <label className="label">Item Name *</label>
            <input className="input" value={form.item_name}
              onChange={(e) => setForm({ ...form, item_name: e.target.value })} required maxLength={255} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Item Code</label>
              <input className="input" value={form.item_code}
                onChange={(e) => setForm({ ...form, item_code: e.target.value })} maxLength={50} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">— Select —</option>
                {categories.map((c) => (<option key={c.id} value={c.id}>{c.category_name}</option>))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Type *</label>
              <select className="input" value={form.item_type}
                onChange={(e) => setForm({ ...form, item_type: e.target.value as ItemType })} required>
                {ITEM_TYPE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </div>
            <div>
              <label className="label">Tax Class *</label>
              <select className="input" value={form.tax_not_tax}
                onChange={(e) => setForm({ ...form, tax_not_tax: e.target.value as ItemTaxClass })} required>
                {TAX_CLASS_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div>
              <label className="label">Percentage</label>
              <input type="number" step="0.01" min="0" className="input" value={form.percentage}
                onChange={(e) => setForm({ ...form, percentage: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
