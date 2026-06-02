'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { BankExchangeRate, Bank, Currency } from '@/types';

function formatRate(v: string | null): string {
  if (v == null) return '0.0000';
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return n.toFixed(4);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BankExchangeRatesPage() {
  const [items, setItems] = useState<BankExchangeRate[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<BankExchangeRate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch('/api/bank-exchange-rates').then((r) => r.json()),
        fetch('/api/banks').then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/currencies').then((r) => r.json()),
      ]);
      if (r1.success) setItems(r1.data);
      if (r2.success) setBanks(r2.data);
      if (r3.success) setCurrencies(r3.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (dateFilter && i.exchange_date !== dateFilter) return false;
      if (!q) return true;
      return (
        i.bank_name?.toLowerCase().includes(q) ||
        i.currency_code?.toLowerCase().includes(q) ||
        i.currency_name?.toLowerCase().includes(q)
      );
    });
  }, [items, search, dateFilter]);

  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } = usePagedList(filtered);

  async function handleDelete(id: number) {
    if (!confirm('Delete this exchange rate row?')) return;
    const res = await fetch(`/api/bank-exchange-rates/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) { alert(json.message || 'Failed'); return; }
    load();
  }

  return (
    <DashboardShell>
      <div className="mb-4"><BackButton /></div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Bank Exchange Rates</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Rate
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search bank, currency..." value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }} />
          </div>
          <input type="date" className="input max-w-[180px]" value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value); resetPage(); }} />
          {dateFilter && (
            <button type="button" className="btn-secondary" onClick={() => { setDateFilter(''); resetPage(); }}>
              Clear date
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Date</th>
                <th>Bank</th>
                <th>Currency</th>
                <th className="text-right">BCC Rate</th>
                <th className="text-right">Bank Rate</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={7} className="text-center text-slate-500 py-8">Loading...</td></tr>)}
              {!loading && paged.length === 0 && (<tr><td colSpan={7} className="text-center text-slate-500 py-8">No exchange rates found</td></tr>)}
              {!loading && paged.map((r, idx) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                  <td className="font-mono text-sm">{r.exchange_date}</td>
                  <td className="font-medium">{r.bank_name || `#${r.bank_id}`}</td>
                  <td>
                    <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 font-mono">
                      {r.currency_code}
                    </span>
                  </td>
                  <td className="text-right font-mono">{formatRate(r.bcc_rate)}</td>
                  <td className="text-right font-mono">{formatRate(r.bank_rate)}</td>
                  <td className="text-right">
                    <button onClick={() => setEditing(r)} className="text-slate-500 hover:text-primary-600 p-1" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="text-slate-500 hover:text-red-600 p-1 ml-1" title="Delete">
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

      {showCreate && (
        <BankExchangeRateFormModal banks={banks} currencies={currencies}
          onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />
      )}
      {editing && (
        <BankExchangeRateFormModal item={editing} banks={banks} currencies={currencies}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </DashboardShell>
  );
}

function BankExchangeRateFormModal({
  item, banks, currencies, onClose, onSaved,
}: {
  item?: BankExchangeRate;
  banks: Bank[];
  currencies: Currency[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;

  const defaultCurrency = currencies.find((c) => c.currency_short_name === 'USD') || currencies[0];

  const [form, setForm] = useState({
    bank_id: item?.bank_id || banks[0]?.id || 0,
    exchange_date: item?.exchange_date || todayISO(),
    currency_id: item?.currency_id || defaultCurrency?.id || 1,
    currency_code: item?.currency_code || defaultCurrency?.currency_short_name || 'USD',
    bcc_rate: item?.bcc_rate ?? '0.0000',
    bank_rate: item?.bank_rate ?? '0.0000',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function onCurrencyChange(id: number) {
    const c = currencies.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      currency_id: id,
      currency_code: c?.currency_short_name || f.currency_code,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const url = isEdit ? `/api/bank-exchange-rates/${item!.id}` : '/api/bank-exchange-rates';
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
          <h2 className="font-semibold">{isEdit ? 'Edit Exchange Rate' : 'Create Exchange Rate'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Bank *</label>
              <select className="input" value={form.bank_id}
                onChange={(e) => setForm({ ...form, bank_id: Number(e.target.value) })} required>
                {banks.length === 0 && <option value="">No banks available</option>}
                {banks.map((b) => (<option key={b.id} value={b.id}>{b.bank_name} ({b.bank_code})</option>))}
              </select>
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={form.exchange_date}
                onChange={(e) => setForm({ ...form, exchange_date: e.target.value })} required />
            </div>
          </div>

          <div>
            <label className="label">Currency *</label>
            <select className="input" value={form.currency_id}
              onChange={(e) => onCurrencyChange(Number(e.target.value))} required>
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>{c.currency_name} ({c.currency_short_name})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">BCC Rate</label>
              <input type="number" step="0.0001" min="0" className="input font-mono" value={form.bcc_rate}
                onChange={(e) => setForm({ ...form, bcc_rate: e.target.value })} />
            </div>
            <div>
              <label className="label">Bank Rate</label>
              <input type="number" step="0.0001" min="0" className="input font-mono" value={form.bank_rate}
                onChange={(e) => setForm({ ...form, bank_rate: e.target.value })} />
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
