'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import Toggle from '@/components/ui/Toggle';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { QuotationCategory } from '@/types';

export default function QuotationCategoriesPage() {
  const [items, setItems] = useState<QuotationCategory[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<QuotationCategory | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/quotation-categories');
      const json = await res.json();
      if (json.success) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => r.category_name?.toLowerCase().includes(q));
  }, [items, search]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } = usePagedList(filtered);

  async function handleDelete(id: number) {
    if (!confirm('Disable this category?')) return;
    const res = await fetch(`/api/quotation-categories/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) { alert(json.message || 'Failed'); return; }
    load();
  }

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Quotation Categories</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Category
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search category name..." value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Category</th>
                <th>Section Header</th>
                <th className="w-20 text-center">Order</th>
                <th className="w-24 text-center">Customs</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={6} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (<tr><td colSpan={6} className="text-center text-slate-500 py-8">No categories found</td></tr>)}
              {!loading && paged.map((r, idx) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium">{r.category_name}</td>
                  <td className="text-slate-600 text-xs">{r.category_header || <span className="text-slate-300">—</span>}</td>
                  <td className="text-center text-slate-600">{r.display_order}</td>
                  <td className="text-center">
                    {r.is_customs
                      ? <span className="inline-block rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-medium">Customs</span>
                      : <span className="text-slate-300">—</span>}
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

      {showCreate && (<CategoryFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />)}
      {editing && (<CategoryFormModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />)}
    </DashboardShell>
  );
}

function CategoryFormModal({
  item, onClose, onSaved,
}: { item?: QuotationCategory; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [name, setName] = useState(item?.category_name || '');
  const [header, setHeader] = useState(item?.category_header || '');
  const [order, setOrder] = useState(item?.display_order != null ? String(item.display_order) : '1');
  const [isCustoms, setIsCustoms] = useState(!!item?.is_customs);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const url = isEdit ? `/api/quotation-categories/${item!.id}` : '/api/quotation-categories';
    const method = isEdit ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_name: name,
          category_header: header || null,
          display_order: Number(order) || 1,
          is_customs: isCustoms,
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
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit Category' : 'Create Category'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div>
            <label className="label">Category Name *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} autoFocus />
          </div>
          <div>
            <label className="label">Section Header</label>
            <input className="input" value={header} onChange={(e) => setHeader(e.target.value)} maxLength={255}
              placeholder="Shown as the section title on the quotation page" />
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="label">Display Order</label>
              <input type="number" min={0} className="input" value={order} onChange={(e) => setOrder(e.target.value)} />
            </div>
            <div className="pb-1">
              <Toggle checked={isCustoms} onChange={setIsCustoms} label="Customs category (CDF columns)" />
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
