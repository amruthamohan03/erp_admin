'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

interface SubOfficeRow {
  id: number;
  sub_office_name: string;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function SubOfficesPage() {
  const [items, setItems] = useState<SubOfficeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SubOfficeRow | null>(null);

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
      const res = await fetch(`/api/v1/sub-offices?${params}`);
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
    if (!confirm('Disable this sub-office?')) return;
    const res = await fetch(`/api/v1/sub-offices/${id}`, { method: 'DELETE' });
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
            <Building2 className="h-6 w-6 text-primary-600" />
            Sub-Offices
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Customs declaration desks under the regional office. Distinct
            from <code>main_office_master_t</code> (the regional office itself).
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Sub-Office
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search sub-office name..."
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
                <th>Sub-Office</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={3} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-slate-500 py-8">
                    No sub-offices found
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-medium">{s.sub_office_name}</td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(s)}
                        className="text-slate-500 hover:text-primary-600 p-1"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
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
        <SubOfficeFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {editing && (
        <SubOfficeFormModal
          subOffice={editing}
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

function SubOfficeFormModal({
  subOffice,
  onClose,
  onSaved,
}: {
  subOffice?: SubOfficeRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!subOffice;
  const [name, setName] = useState(subOffice?.sub_office_name || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Skip the check while value is unchanged in edit mode — it would
  // always collide with itself otherwise.
  const checkValue = isEdit && name === subOffice?.sub_office_name ? '' : name;
  const { status, message } = useUniqueCheck({
    resource: 'sub-offices',
    value: checkValue,
    excludeId: subOffice?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/v1/sub-offices/${subOffice!.id}`
      : '/api/v1/sub-offices';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub_office_name: name }),
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
            {isEdit ? 'Edit Sub-Office' : 'Create Sub-Office'}
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
            <label className="label">Sub-Office Name *</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="DGDA Kinshasa Port"
            />
            <div className="mt-1 text-right">
              <UniquenessIndicator status={status} message={message} />
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
