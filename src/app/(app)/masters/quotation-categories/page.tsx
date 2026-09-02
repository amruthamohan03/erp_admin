'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import Toggle from '@/components/ui/Toggle';

interface QuotationCategoryRow {
  id: number;
  category_name: string;
  category_header: string | null;
  display_order: number;
  is_customs: boolean;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function QuotationCategoriesPage() {
  const [items, setItems] = useState<QuotationCategoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<QuotationCategoryRow | null>(null);
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
      const res = await fetch(`/api/v1/quotation-categories?${params}`);
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
    if (!confirm('Disable this category?')) return;
    const res = await fetch(`/api/v1/quotation-categories/${id}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This category could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The category has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Quotation Categories
        </h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Category
        </button>
      </div>

      <DataTable<QuotationCategoryRow>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search category name..."
        emptyMessage="No quotation categorys yet — create the first one."
        columns={[
        { key: 'category_name', header: 'Category', sortable: true, className: 'font-medium' },
        { key: 'category_header', header: 'Section Header', className: 'text-muted-foreground text-xs', render: (r: QuotationCategoryRow) => (
            <>
            {r.category_header || (
                        <span className="text-muted-foreground">—</span>
                      )}
            </>
          ) },
        { key: 'display_order', header: 'Order', sortable: true, align: 'center', className: 'text-muted-foreground' },
        { key: 'is_customs', header: 'Customs', align: 'center', render: (r: QuotationCategoryRow) => (
            <>
            {r.is_customs ? (
                        <span className="inline-block rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs font-medium">
                          Customs
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
            </>
          ) },
        ]}
        actions={(r) => ({ edit: () => setEditing(r), remove: () => handleDelete(r.id) })}
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
        <QuotationCategoryFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The category has been created.' });
          }}
        />
      )}

      {editing && (
        <QuotationCategoryFormModal
          category={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this category have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function QuotationCategoryFormModal({
  category,
  onClose,
  onSaved,
}: {
  category?: QuotationCategoryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!category;
  const [name, setName] = useState(category?.category_name || '');
  const [header, setHeader] = useState(category?.category_header || '');
  const [order, setOrder] = useState(
    category?.display_order != null ? String(category.display_order) : '1',
  );
  const [isCustoms, setIsCustoms] = useState(!!category?.is_customs);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/v1/quotation-categories/${category!.id}`
      : '/api/v1/quotation-categories';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_name: name,
          category_header: header || null,
          display_order: Number(order) || 1,
          is_customs: isCustoms,
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
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Category' : 'Create Category'}
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
            <label className="label required">Category Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={150}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Section Header</label>
            <input
              className="input"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              maxLength={255}
              placeholder="Shown as the section title on the quotation page"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="label">Display Order</label>
              <input
                type="number"
                min={0}
                className="input"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </div>
            <div className="pb-1">
              <Toggle
                checked={isCustoms}
                onChange={setIsCustoms}
                label="Customs category (CDF columns)"
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
