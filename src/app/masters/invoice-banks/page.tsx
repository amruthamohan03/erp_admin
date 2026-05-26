'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { InvoiceBank } from '@/types';

export default function InvoiceBanksPage() {
  const [items, setItems] = useState<InvoiceBank[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<InvoiceBank | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoice-banks');
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
      i.invoice_bank_name?.toLowerCase().includes(q) ||
      i.invoice_bank_account_name?.toLowerCase().includes(q) ||
      i.invoice_bank_account_number?.toLowerCase().includes(q) ||
      (i.invoice_bank_swift ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } = usePagedList(filtered);

  async function handleDelete(id: number) {
    if (!confirm('Disable this invoice bank?')) return;
    const res = await fetch(`/api/invoice-banks/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) { alert(json.message || 'Failed'); return; }
    load();
  }

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Invoice Banks</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Invoice Bank
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search bank, account, SWIFT..." value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Bank</th>
                <th>Account Name</th>
                <th>Account Number</th>
                <th>SWIFT</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={6} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (<tr><td colSpan={6} className="text-center text-slate-500 py-8">No invoice banks found</td></tr>)}
              {!loading && paged.map((i, idx) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-medium">{i.invoice_bank_name}</td>
                  <td>{i.invoice_bank_account_name}</td>
                  <td className="font-mono text-xs">{i.invoice_bank_account_number}</td>
                  <td className="font-mono text-xs">{i.invoice_bank_swift || '—'}</td>
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

      {showCreate && (<InvoiceBankFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />)}
      {editing && (<InvoiceBankFormModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />)}
    </DashboardShell>
  );
}

function InvoiceBankFormModal({
  item, onClose, onSaved,
}: { item?: InvoiceBank; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    invoice_bank_name: item?.invoice_bank_name || '',
    invoice_bank_account_name: item?.invoice_bank_account_name || '',
    invoice_bank_account_number: item?.invoice_bank_account_number || '',
    invoice_bank_swift: item?.invoice_bank_swift || '',
    invoice_bank_address: item?.invoice_bank_address || '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const url = isEdit ? `/api/invoice-banks/${item!.id}` : '/api/invoice-banks';
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
          <h2 className="font-semibold">{isEdit ? 'Edit Invoice Bank' : 'Create Invoice Bank'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div>
            <label className="label">Bank Name *</label>
            <input className="input uppercase" value={form.invoice_bank_name}
              onChange={(e) => setForm({ ...form, invoice_bank_name: e.target.value.toUpperCase() })} required maxLength={255} />
          </div>
          <div>
            <label className="label">Account Name *</label>
            <input className="input uppercase" value={form.invoice_bank_account_name}
              onChange={(e) => setForm({ ...form, invoice_bank_account_name: e.target.value.toUpperCase() })} required maxLength={255} />
          </div>
          <div>
            <label className="label">Account Number *</label>
            <input className="input font-mono" value={form.invoice_bank_account_number}
              onChange={(e) => setForm({ ...form, invoice_bank_account_number: e.target.value })} required maxLength={50} />
          </div>
          <div>
            <label className="label">SWIFT</label>
            <input className="input font-mono uppercase" value={form.invoice_bank_swift}
              onChange={(e) => setForm({ ...form, invoice_bank_swift: e.target.value.toUpperCase() })} maxLength={20} />
          </div>
          <div>
            <label className="label">Address</label>
            <textarea className="input min-h-[64px]" value={form.invoice_bank_address}
              onChange={(e) => setForm({ ...form, invoice_bank_address: e.target.value })} />
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
