'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import UniqueAvailability from '@/components/ui/UniqueAvailability';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import type { Phase } from '@/types';

export default function PhasesPage() {
  const [items, setItems] = useState<Phase[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Phase | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/phases');
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
    return items.filter((i) =>
      i.phase_name?.toLowerCase().includes(q) ||
      i.phase_code?.toLowerCase().includes(q),
    );
  }, [items, search]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } = usePagedList(filtered);

  async function handleDelete(id: number) {
    if (!confirm('Disable this phase?')) return;
    const res = await fetch(`/api/phases/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) { alert(json.message || 'Failed'); return; }
    load();
  }

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Phases</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Phase
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search phase name or code..." value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Phase</th>
                <th>Code</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={4} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (<tr><td colSpan={4} className="text-center text-slate-500 py-8">No phases found</td></tr>)}
              {!loading && paged.map((i, idx) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium">{i.phase_name}</td>
                  <td className="font-mono text-xs">{i.phase_code}</td>
                  <td className="text-right">
                    <button onClick={() => setEditing(i)} className="text-slate-500 hover:text-primary-600 p-1" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(i.id)} className="text-slate-500 hover:text-red-600 p-1 ml-1" title="Disable">
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

      {showCreate && (<PhaseFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />)}
      {editing && (<PhaseFormModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />)}
    </DashboardShell>
  );
}

function PhaseFormModal({
  item, onClose, onSaved,
}: { item?: Phase; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    phase_name: item?.phase_name || '',
    phase_code: item?.phase_code || '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const uniqueName = useUniqueCheck({
    endpoint: '/api/uniqueness/phases',
    value: form.phase_name,
    excludeId: item?.id ?? null,
  });
  const uniqueCode = useUniqueCheck({
    endpoint: '/api/uniqueness/phase-codes',
    value: form.phase_code,
    excludeId: item?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (uniqueName.status === 'taken' || uniqueCode.status === 'taken') {
      setError('Already exists'); return;
    }
    setSaving(true); setError(null);
    const url = isEdit ? `/api/phases/${item!.id}` : '/api/phases';
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

  const blocked = uniqueName.status === 'taken' || uniqueCode.status === 'taken';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit Phase' : 'Create Phase'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div>
            <label className="label">Phase Name *</label>
            <input className="input" value={form.phase_name}
              onChange={(e) => setForm({ ...form, phase_name: e.target.value })} required maxLength={150} />
            <UniqueAvailability status={uniqueName.status} message={uniqueName.message} />
          </div>
          <div>
            <label className="label">Phase Code *</label>
            <input className="input font-mono uppercase" value={form.phase_code}
              onChange={(e) => setForm({ ...form, phase_code: e.target.value.toUpperCase() })} required maxLength={50} />
            <UniqueAvailability status={uniqueCode.status} message={uniqueCode.message} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || blocked} className="btn-primary">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
