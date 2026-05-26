'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X, AlertCircle } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import PaginationFooter from '@/components/ui/PaginationFooter';
import UniqueAvailability from '@/components/ui/UniqueAvailability';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import type { HsCode } from '@/types';

const RATE_FIELDS = [
  { key: 'hscode_ddi', label: 'DDI' },
  { key: 'hscode_ica', label: 'ICA' },
  { key: 'hscode_dci', label: 'DCI' },
  { key: 'hscode_dcl', label: 'DCL' },
  { key: 'hscode_tpi', label: 'TPI' },
] as const;

function fmt(n: string | null) {
  if (n === null || n === undefined) return '0.00';
  return n;
}

export default function HscodesPage() {
  const [items, setItems] = useState<HsCode[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<HsCode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hscodes');
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
    return items.filter((i) => i.hscode_number?.toLowerCase().includes(q));
  }, [items, search]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } = usePagedList(filtered);

  async function handleDelete(id: number) {
    if (!confirm('Disable this HS code?')) return;
    const res = await fetch(`/api/hscodes/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) { alert(json.message || 'Failed'); return; }
    load();
  }

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">HS Codes</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New HS Code
        </button>
      </div>

      

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search HS code number..." value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>HS Code</th>
                {RATE_FIELDS.map((f) => (<th key={f.key} className="text-right">{f.label} (%)</th>))}
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={8} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (<tr><td colSpan={8} className="text-center text-slate-500 py-8">No HS codes found</td></tr>)}
              {!loading && paged.map((i, idx) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-mono">{i.hscode_number}</td>
                  {RATE_FIELDS.map((f) => (
                    <td key={f.key} className="text-right font-mono text-xs">
                      {fmt((i as unknown as Record<string, string | null>)[f.key])}
                    </td>
                  ))}
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

      {showCreate && (<HscodeFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />)}
      {editing && (<HscodeFormModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />)}
    </DashboardShell>
  );
}

function HscodeFormModal({
  item, onClose, onSaved,
}: { item?: HsCode; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    hscode_number: item?.hscode_number || '',
    hscode_ddi: item?.hscode_ddi ?? '0.00',
    hscode_ica: item?.hscode_ica ?? '0.00',
    hscode_dci: item?.hscode_dci ?? '0.00',
    hscode_dcl: item?.hscode_dcl ?? '0.00',
    hscode_tpi: item?.hscode_tpi ?? '0.00',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unique = useUniqueCheck({
    endpoint: '/api/uniqueness/hscodes',
    value: form.hscode_number,
    excludeId: item?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (unique.status === 'taken') { setError('Already exists'); return; }
    setSaving(true); setError(null);
    const url = isEdit ? `/api/hscodes/${item!.id}` : '/api/hscodes';
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
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit HS Code' : 'Create HS Code'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div>
            <label className="label">HS Code Number *</label>
            <input className="input font-mono" value={form.hscode_number}
              onChange={(e) => setForm({ ...form, hscode_number: e.target.value })} required maxLength={100} />
            <UniqueAvailability status={unique.status} message={unique.message} />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {RATE_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label">{f.label} (%)</label>
                <input
                  className="input text-right"
                  type="number"
                  step="0.01"
                  min="0"
                  max="999.99"
                  value={(form as unknown as Record<string, string>)[f.key]}
                  onChange={(e) =>
                    setForm({ ...form, [f.key]: e.target.value } as typeof form)
                  }
                />
              </div>
            ))}
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
