'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import SearchableSelect from '@/components/ui/SearchableSelect';

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

const TAX_CLASSES = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
];

// item_type is 1-3 chars from {I,E,U}. Persisted as a single string
// (e.g. "IEU"); the UI exposes it as three checkboxes.
const TYPE_LETTERS = [
  { value: 'I', label: 'Import' },
  { value: 'E', label: 'Export' },
  { value: 'U', label: 'Universal' },
];

function typeStringToSet(s: string): Set<string> {
  return new Set(s.split('').filter((c) => 'IEU'.includes(c)));
}

function typeSetToString(set: Set<string>): string {
  // Stable order I → E → U so renames don't churn.
  return ['I', 'E', 'U'].filter((c) => set.has(c)).join('');
}

const FILTER_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'I', label: 'Import (incl. IE/IU/IEU)' },
  { value: 'E', label: 'Export (incl. IE/EU/IEU)' },
  { value: 'U', label: 'Universal (incl. IU/EU/IEU)' },
];

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
    if (!confirm('Disable this item? References from quotations stay intact.')) {
      return;
    }
    const res = await fetch(`/api/v1/items/${id}`, { method: 'DELETE' });
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
            <ShoppingBag className="h-6 w-6 text-primary-600" />
            Items / Services
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Charges that appear on quotations + Fiche de Calcul. Trade
            direction (Import / Export / Universal) controls which quotation
            kinds can pick the item.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Item
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search name or code..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="min-w-[180px]">
            <SearchableSelect
              value={categoryFilter}
              onChange={(v) => {
                setCategoryFilter(v);
                setPage(1);
              }}
              options={categories.map((c) => ({
                value: String(c.id),
                label: c.category_name,
              }))}
              placeholder="All categories"
              emptyLabel="All categories"
            />
          </div>
          <select
            className="input max-w-[220px]"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            {FILTER_TYPE_OPTIONS.map((o) => (
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
                <th>Item</th>
                <th>Code</th>
                <th>Category</th>
                <th className="text-center">Tax</th>
                <th className="text-right">%</th>
                <th className="text-center">Direction</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500 py-8">
                    No items found
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((it, idx) => (
                  <tr key={it.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-medium">{it.item_name}</td>
                    <td>
                      {it.item_code ? (
                        <code className="text-xs text-slate-600">
                          {it.item_code}
                        </code>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-slate-600">
                      {it.category_name || '—'}
                    </td>
                    <td className="text-center">
                      <code className="text-xs text-slate-600">
                        {it.tax_not_tax}
                      </code>
                    </td>
                    <td className="text-right font-mono">{it.percentage}</td>
                    <td className="text-center">
                      <code className="text-xs text-slate-600">
                        {it.item_type}
                      </code>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(it)}
                        className="text-slate-500 hover:text-primary-600 p-1"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(it.id)}
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
        <ItemFormModal
          categories={categories}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
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
          }}
        />
      )}
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
  const [name, setName] = useState(item?.item_name || '');
  const [code, setCode] = useState(item?.item_code || '');
  const [categoryId, setCategoryId] = useState<string>(
    item?.category_id != null ? String(item.category_id) : '',
  );
  const [taxClass, setTaxClass] = useState<string>(item?.tax_not_tax || 'A');
  const [percentage, setPercentage] = useState<string>(item?.percentage || '0');
  const [types, setTypes] = useState<Set<string>>(
    item ? typeStringToSet(item.item_type) : new Set(['U']),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      setError('Pick at least one trade direction');
      setSaving(false);
      return;
    }

    const url = isEdit ? `/api/v1/items/${item!.id}` : '/api/v1/items';
    const method = isEdit ? 'PUT' : 'POST';
    const payload = {
      item_name: name,
      item_code: code.trim() || null,
      category_id: categoryId ? Number(categoryId) : null,
      tax_not_tax: taxClass,
      percentage: Number(percentage),
      item_type: typeSetToString(types),
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit Item' : 'Create Item'}</h2>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Item Name *</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Customs clearance fee"
              />
            </div>
            <div>
              <label className="label">Item Code</label>
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={50}
                placeholder="CCF-001"
              />
            </div>
          </div>
          <div>
            <label className="label">Category</label>
            <SearchableSelect
              value={categoryId}
              onChange={(v) => setCategoryId(v)}
              options={categories.map((c) => ({
                value: String(c.id),
                label: c.category_name,
              }))}
              placeholder="Select a category..."
              emptyLabel="— No category —"
            />
            <p className="text-xs text-slate-500 mt-1">
              Drives which quotation section this item lands in. Customs-flagged
              categories switch to CDF for Import-Definitive quotations.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tax Class *</label>
              <select
                className="input"
                value={taxClass}
                onChange={(e) => setTaxClass(e.target.value)}
                required
              >
                {TAX_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                A = standard taxable.
              </p>
            </div>
            <div>
              <label className="label">Percentage</label>
              <input
                type="number"
                step="0.01"
                min={0}
                className="input"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Trade Direction *</label>
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
              Stored as a 1–3 char string ({typeSetToString(types) || '—'}).
              Quotation kind filters lookups against this.
            </p>
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
