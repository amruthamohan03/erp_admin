'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { Kind } from '@/types';

export default function KindsPage() {
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Kind | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/kinds');
      const json = await res.json();
      if (json.success) setKinds(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return kinds;
    return kinds.filter(
      (k) =>
        k.kind_name?.toLowerCase().includes(q) ||
        k.kind_short_name?.toLowerCase().includes(q),
    );
  }, [kinds, search]);

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

  async function handleDelete(id: number) {
    if (!confirm('Disable this kind?')) return;
    const res = await fetch(`/api/kinds/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || 'Failed');
      return;
    }
    load();
  }

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Kinds</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Kind
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search kind name, short name..."
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
                <th>Kind Name</th>
                <th>Short Name</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={4} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (<tr><td colSpan={4} className="text-center text-slate-500 py-8">No kinds found</td></tr>)}
              {!loading && paged.map((k, idx) => (
                <tr key={k.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium">{k.kind_name}</td>
                  <td>
                    <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 font-mono">
                      {k.kind_short_name}
                    </span>
                  </td>
                  <td className="text-right">
                    <button onClick={() => setEditing(k)} className="text-slate-500 hover:text-primary-600 p-1" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(k.id)} className="text-slate-500 hover:text-red-600 p-1 ml-1" title="Disable">
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
        <KindFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}

      {editing && (
        <KindFormModal
          kind={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </DashboardShell>
  );
}

function KindFormModal({
  kind,
  onClose,
  onSaved,
}: {
  kind?: Kind;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!kind;
  const [form, setForm] = useState({
    kind_name: kind?.kind_name || '',
    kind_short_name: kind?.kind_short_name || '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/kinds/${kind!.id}` : '/api/kinds';
    const method = isEdit ? 'PUT' : 'POST';

    const payload = {
      kind_name: form.kind_name,
      kind_short_name: form.kind_short_name,
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || 'Save failed');
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
          <h2 className="font-semibold">{isEdit ? 'Edit Kind' : 'Create Kind'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div>
            <label className="label">Kind Name *</label>
            <input className="input" value={form.kind_name}
              onChange={(e) => setForm({ ...form, kind_name: e.target.value })} required maxLength={100} />
          </div>
          <div>
            <label className="label">Short Name *</label>
            <input className="input uppercase" value={form.kind_short_name}
              onChange={(e) => setForm({ ...form, kind_short_name: e.target.value.toUpperCase() })} required maxLength={20} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
