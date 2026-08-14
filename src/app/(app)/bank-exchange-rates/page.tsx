'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import SearchableSelect from '@/components/ui/SearchableSelect';
import PaginationFooter from '@/components/ui/PaginationFooter';

interface Row {
  id: number;
  bank_id: number;
  bank_name: string | null;
  bank_code: string | null;
  currency_id: number;
  currency_short_name: string | null;
  exchange_date: string;
  bcc_rate: string | null;
  bank_rate: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface BankOption {
  id: number;
  bank_name: string;
  bank_code: string;
}
interface CurrencyOption {
  id: number;
  currency_name: string;
  currency_short_name?: string;
}

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
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(false);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [banks, setBanks] = useState<BankOption[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Picker data — banks scoped to for_exchange=Y since that's the
  // only valid source for a rate entry.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, c] = await Promise.all([
          fetch('/api/v1/banks?for_exchange=Y&pageSize=200').then((r) =>
            r.json(),
          ),
          fetch('/api/v1/currencies?pageSize=200').then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (b.ok) setBanks(b.data);
        if (c.ok) setCurrencies(c.data);
      } catch {
        if (!cancelled) setError('Failed to load picker data');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      // Single-day lookup on the range endpoint: from = to = the picked date.
      if (dateFilter) {
        params.set('from', dateFilter);
        params.set('to', dateFilter);
      }
      const res = await fetch(`/api/v1/bank-exchange-rates?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, dateFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.bank_name?.toLowerCase().includes(q) ||
        i.bank_code?.toLowerCase().includes(q) ||
        i.currency_short_name?.toLowerCase().includes(q),
    );
  }, [items, search]);

  async function handleDelete(id: number) {
    if (!confirm('Delete this exchange rate row?')) return;
    const res = await fetch(`/api/v1/bank-exchange-rates/${id}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This rate could not be deleted.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The exchange rate has been deleted.' });
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Bank Exchange Rates
        </h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Rate
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              className="input pl-9"
              placeholder="Search bank, currency..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <input
            type="date"
            className="input max-w-[180px]"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
          />
          {dateFilter && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setDateFilter('');
                setPage(1);
              }}
            >
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
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-8">
                    No exchange rates found
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="text-muted-foreground font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-mono text-sm">{r.exchange_date}</td>
                    <td className="font-medium">
                      {r.bank_name || `#${r.bank_id}`}
                    </td>
                    <td>
                      <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 font-mono">
                        {r.currency_short_name}
                      </span>
                    </td>
                    <td className="text-right font-mono">
                      {formatRate(r.bcc_rate)}
                    </td>
                    <td className="text-right font-mono">
                      {formatRate(r.bank_rate)}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => setEditing(r)}
                        className="ico-edit"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="ico-delete ml-1"
                        title="Delete"
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
        <BankExchangeRateFormModal
          banks={banks}
          currencies={currencies}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {editing && (
        <BankExchangeRateFormModal
          item={editing}
          banks={banks}
          currencies={currencies}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function BankExchangeRateFormModal({
  item,
  banks,
  currencies,
  onClose,
  onSaved,
}: {
  item?: Row;
  banks: BankOption[];
  currencies: CurrencyOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;

  const defaultCurrency =
    currencies.find((c) => c.currency_short_name === 'USD') || currencies[0];

  const [form, setForm] = useState({
    bank_id: item?.bank_id || banks[0]?.id || 0,
    exchange_date: item?.exchange_date || todayISO(),
    currency_id: item?.currency_id || defaultCurrency?.id || 1,
    bcc_rate: item?.bcc_rate ?? '0.0000',
    bank_rate: item?.bank_rate ?? '0.0000',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const url = isEdit
      ? `/api/v1/bank-exchange-rates/${item!.id}`
      : '/api/v1/bank-exchange-rates';
    const method = isEdit ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
            {isEdit ? 'Edit Exchange Rate' : 'Create Exchange Rate'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-slate-900"
          >
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
              <label className="label required">Bank</label>
              <SearchableSelect
                value={String(form.bank_id)}
                required
                placeholder={banks.length === 0 ? 'No banks available' : 'Select...'}
                options={banks.map((b) => ({
                  value: String(b.id),
                  label: `${b.bank_name} (${b.bank_code})`,
                }))}
                onChange={(v) => setForm({ ...form, bank_id: Number(v) })}
              />
            </div>
            <div>
              <label className="label required">Date</label>
              <input
                type="date"
                className="input"
                value={form.exchange_date}
                onChange={(e) =>
                  setForm({ ...form, exchange_date: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div>
            <label className="label required">Currency</label>
            <SearchableSelect
              value={String(form.currency_id)}
              required
              options={currencies.map((c) => ({
                value: String(c.id),
                label: `${c.currency_name} (${c.currency_short_name})`,
              }))}
              onChange={(v) => setForm({ ...form, currency_id: Number(v) })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">BCC Rate</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="input font-mono"
                value={form.bcc_rate}
                onChange={(e) => setForm({ ...form, bcc_rate: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Bank Rate</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="input font-mono"
                value={form.bank_rate}
                onChange={(e) =>
                  setForm({ ...form, bank_rate: e.target.value })
                }
              />
            </div>
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
