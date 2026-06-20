'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, FolderTree, Plus, Search, Trash2, X } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
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
    if (!confirm('Disable this category? Items referencing it stay intact.')) {
      return;
    }
    const res = await fetch(`/api/v1/quotation-categories/${id}`, {
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
            <FolderTree className="h-6 w-6 text-primary-600" />
            Quotation Categories
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Section headings for quotation lines. The <code>is_customs</code> flag
            is load-bearing — in Import-Definitive mode that category switches
            its money columns to CDF.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Category
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search name or header..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Category</th>
                <th>Section Header</th>
                <th className="text-center">Order</th>
                <th className="text-center">Customs</th>
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
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-8">
                    No categories found
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((c, idx) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-medium">{c.category_name}</td>
                    <td className="text-slate-600">
                      {c.category_header || '—'}
                    </td>
                    <td className="text-center">{c.display_order}</td>
                    <td className="text-center">
                      {c.is_customs ? (
                        <span className="inline-block rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700 border border-amber-200">
                          Yes (CDF)
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No</span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(c)}
                        className="text-slate-500 hover:text-primary-600 p-1"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
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
        <QuotationCategoryFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
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
          }}
        />
      )}
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
  const [displayOrder, setDisplayOrder] = useState<number>(
    category?.display_order ?? 1,
  );
  const [isCustoms, setIsCustoms] = useState<boolean>(
    category?.is_customs ?? false,
  );
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
          category_header: header.trim() || null,
          display_order: displayOrder,
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
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Category' : 'Create Category'}
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
            <label className="label">Category Name *</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Customs Clearance"
            />
          </div>
          <div>
            <label className="label">Section Header</label>
            <input
              className="input"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="Customs Clearance / Dédouanement"
            />
            <p className="text-xs text-slate-500 mt-1">
              Bilingual label shown above the category&apos;s lines on a
              quotation. Falls back to the category name if blank.
            </p>
          </div>
          <div>
            <label className="label">Display Order</label>
            <input
              type="number"
              min={1}
              className="input"
              value={displayOrder}
              onChange={(e) =>
                setDisplayOrder(Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Lower values appear higher on the quotation.
            </p>
          </div>
          <div>
            <Toggle
              checked={isCustoms}
              onChange={setIsCustoms}
              label="Customs category (switches to CDF in Import-Definitive mode)"
            />
            <p className="text-xs text-slate-500 mt-1">
              Set <strong>at most one</strong> category as the customs one. The
              flag — not the name — is what the compute layer checks, so this
              keeps working if you rename the category.
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
