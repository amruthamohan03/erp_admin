'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import Toggle from '@/components/ui/Toggle';
import PaginationFooter from '@/components/ui/PaginationFooter';
import UniqueAvailability from '@/components/ui/UniqueAvailability';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import type { Bank } from '@/types';

export default function BanksPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Bank | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/banks');
      const json = await res.json();
      if (json.success) setBanks(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter(
      (b) =>
        b.bank_name?.toLowerCase().includes(q) ||
        b.bank_code?.toLowerCase().includes(q),
    );
  }, [banks, search]);

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
    if (!confirm('Disable this bank?')) return;
    const res = await fetch(`/api/banks/${id}`, { method: 'DELETE' });
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
        <h1 className="text-2xl font-bold text-slate-900">Banks</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Bank
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search bank name, code..."
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
                <th>Bank Name</th>
                <th>Bank Code</th>
                <th>For Exchange</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={5} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (<tr><td colSpan={5} className="text-center text-slate-500 py-8">No banks found</td></tr>)}
              {!loading && paged.map((b, idx) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium">{b.bank_name}</td>
                  <td>{b.bank_code}</td>
                  <td><Flag on={b.for_exchange === 'Y'} /></td>
                  <td className="text-right">
                    <button onClick={() => setEditing(b)} className="text-slate-500 hover:text-primary-600 p-1" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(b.id)} className="text-slate-500 hover:text-red-600 p-1 ml-1" title="Disable">
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
        <BankFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}

      {editing && (
        <BankFormModal
          bank={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </DashboardShell>
  );
}

function Flag({ on }: { on: boolean }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {on ? 'Yes' : 'No'}
    </span>
  );
}

function BankFormModal({
  bank,
  onClose,
  onSaved,
}: {
  bank?: Bank;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!bank;
  const [form, setForm] = useState({
    bank_name: bank?.bank_name || '',
    bank_code: bank?.bank_code || 'N/A',
    for_exchange: bank?.for_exchange === 'Y',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unique = useUniqueCheck({
    endpoint: '/api/uniqueness/banks',
    value: form.bank_name,
    excludeId: bank?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (unique.status === 'taken') { setError('Already exists'); return; }
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/banks/${bank!.id}` : '/api/banks';
    const method = isEdit ? 'PUT' : 'POST';

    const payload = {
      bank_name: form.bank_name,
      bank_code: form.bank_code,
      for_exchange: form.for_exchange ? 'Y' : 'N',
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
          <h2 className="font-semibold">{isEdit ? 'Edit Bank' : 'Create Bank'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div>
            <label className="label">Bank Name *</label>
            <input className="input" value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })} required />
            <UniqueAvailability status={unique.status} message={unique.message} />
          </div>
          <div>
            <label className="label">Bank Code *</label>
            <input className="input" value={form.bank_code}
              onChange={(e) => setForm({ ...form, bank_code: e.target.value })} required maxLength={20} />
          </div>
          <div>
            <Toggle
              checked={form.for_exchange}
              onChange={(v) => setForm({ ...form, for_exchange: v })}
              label="For Exchange"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || unique.status === 'taken'} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
