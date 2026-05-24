'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import Toggle from '@/components/ui/Toggle';
import type { TransitPoint } from '@/types';

type FlagKey = 'entry_point' | 'exit_point' | 'loading' | 'destination' | 'warehouse' | 'location';

const FLAGS: { key: FlagKey; label: string; short: string; badgeClass: string }[] = [
  { key: 'entry_point',  label: 'Entry Point',  short: 'ENT', badgeClass: 'bg-blue-100 text-blue-700' },
  { key: 'exit_point',   label: 'Exit Point',   short: 'EXT', badgeClass: 'bg-cyan-100 text-cyan-700' },
  { key: 'loading',      label: 'Loading',      short: 'LOAD', badgeClass: 'bg-emerald-100 text-emerald-700' },
  { key: 'destination',  label: 'Destination',  short: 'DEST', badgeClass: 'bg-amber-100 text-amber-700' },
  { key: 'warehouse',    label: 'Warehouse',    short: 'WH',  badgeClass: 'bg-violet-100 text-violet-700' },
  { key: 'location',     label: 'Location',     short: 'LOC', badgeClass: 'bg-rose-100 text-rose-700' },
];

export default function TransitPointsPage() {
  const [items, setItems] = useState<TransitPoint[]>([]);
  const [search, setSearch] = useState('');
  const [flagFilter, setFlagFilter] = useState<FlagKey | ''>('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<TransitPoint | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/transit-points');
      const json = await res.json();
      if (json.success) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((tp) => {
      if (flagFilter && !tp[flagFilter]) return false;
      if (!q) return true;
      return tp.transit_point_name?.toLowerCase().includes(q);
    });
  }, [items, search, flagFilter]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } = usePagedList(filtered);

  async function handleDelete(id: number) {
    if (!confirm('Disable this transit point?')) return;
    const res = await fetch(`/api/transit-points/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) { alert(json.message || 'Failed'); return; }
    load();
  }

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Transit Points</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Transit Point
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search transit point name..." value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          </div>
          <select className="input max-w-[200px]" value={flagFilter}
            onChange={(e) => { setFlagFilter(e.target.value as FlagKey | ''); resetPage(); }}>
            <option value="">All Flags</option>
            {FLAGS.map((f) => (<option key={f.key} value={f.key}>{f.label}</option>))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Transit Point</th>
                <th>Flags</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={4} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (<tr><td colSpan={4} className="text-center text-slate-500 py-8">No transit points found</td></tr>)}
              {!loading && paged.map((tp, idx) => (
                <tr key={tp.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium">{tp.transit_point_name}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {FLAGS.filter((f) => tp[f.key]).map((f) => (
                        <span key={f.key} className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${f.badgeClass}`}>
                          {f.short}
                        </span>
                      ))}
                      {FLAGS.every((f) => !tp[f.key]) && (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="text-right">
                    <button onClick={() => setEditing(tp)} className="text-slate-500 hover:text-primary-600 p-1" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(tp.id)} className="text-slate-500 hover:text-red-600 p-1 ml-1" title="Disable">
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

      {showCreate && (<TransitPointFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />)}
      {editing && (<TransitPointFormModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />)}
    </DashboardShell>
  );
}

function TransitPointFormModal({
  item, onClose, onSaved,
}: { item?: TransitPoint; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    transit_point_name: item?.transit_point_name || '',
    entry_point:  item?.entry_point  ?? true,
    exit_point:   item?.exit_point   ?? true,
    loading:      item?.loading      ?? true,
    destination:  item?.destination  ?? true,
    warehouse:    item?.warehouse    ?? false,
    location:     item?.location     ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const url = isEdit ? `/api/transit-points/${item!.id}` : '/api/transit-points';
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
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit Transit Point' : 'Create Transit Point'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-4">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div>
            <label className="label">Transit Point Name *</label>
            <input className="input uppercase" value={form.transit_point_name}
              onChange={(e) => setForm({ ...form, transit_point_name: e.target.value.toUpperCase() })} required maxLength={255} />
          </div>
          <div>
            <label className="label">Flags</label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              {FLAGS.map((f) => (
                <Toggle
                  key={f.key}
                  checked={form[f.key]}
                  onChange={(v) => setForm({ ...form, [f.key]: v })}
                  label={f.label}
                />
              ))}
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
