'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Edit2,
  LineChart,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import SearchableSelect from '@/components/ui/SearchableSelect';

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

function fmtRate(v: string | null): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(4);
}

export default function BankExchangeRatesPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [bankFilter, setBankFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
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

  // Picker data — banks scoped to for_exchange=true since that's the
  // only valid source for a rate entry.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, c] = await Promise.all([
          fetch('/api/v1/banks?for_exchange=true&pageSize=200').then((r) =>
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
      if (bankFilter) params.set('bank_id', bankFilter);
      if (currencyFilter) params.set('currency_id', currencyFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await fetch(`/api/v1/bank-exchange-rates?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, bankFilter, currencyFilter, fromDate, toDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Delete this rate entry? This cannot be undone.')) return;
    const res = await fetch(`/api/v1/bank-exchange-rates/${id}`, {
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
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <LineChart className="h-6 w-6 text-primary-600" />
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
        <div className="p-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div className="min-w-[200px]">
            <SearchableSelect
              value={bankFilter}
              onChange={(v) => {
                setBankFilter(v);
                setPage(1);
              }}
              options={banks.map((b) => ({
                value: String(b.id),
                label: `${b.bank_code} — ${b.bank_name}`,
              }))}
              placeholder="All banks"
              emptyLabel="All banks"
            />
          </div>
          <div className="min-w-[160px]">
            <SearchableSelect
              value={currencyFilter}
              onChange={(v) => {
                setCurrencyFilter(v);
                setPage(1);
              }}
              options={currencies.map((c) => ({
                value: String(c.id),
                label: c.currency_short_name || c.currency_name,
              }))}
              placeholder="All currencies"
              emptyLabel="All currencies"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">From</label>
            <input
              type="date"
              className="input"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">To</label>
            <input
              type="date"
              className="input"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-12">#</th>
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
                  <td colSpan={7} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-8">
                    No rate entries found
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-mono text-sm">{r.exchange_date}</td>
                    <td>
                      {r.bank_code ? (
                        <code className="text-xs text-slate-600">
                          {r.bank_code}
                        </code>
                      ) : (
                        '—'
                      )}{' '}
                      {r.bank_name || ''}
                    </td>
                    <td className="font-mono text-sm">
                      {r.currency_short_name || '—'}
                    </td>
                    <td className="text-right font-mono">
                      {fmtRate(r.bcc_rate)}
                    </td>
                    <td className="text-right font-mono">
                      {fmtRate(r.bank_rate)}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(r)}
                        className="text-slate-500 hover:text-primary-600 p-1"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-slate-500 hover:text-red-600 p-1 ml-1"
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
        <FormModal
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
        <FormModal
          row={editing}
          banks={banks}
          currencies={currencies}
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

function FormModal({
  row,
  banks,
  currencies,
  onClose,
  onSaved,
}: {
  row?: Row;
  banks: BankOption[];
  currencies: CurrencyOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [bankId, setBankId] = useState<string>(
    row?.bank_id ? String(row.bank_id) : '',
  );
  const [currencyId, setCurrencyId] = useState<string>(
    row?.currency_id ? String(row.currency_id) : '',
  );
  const [exchangeDate, setExchangeDate] = useState(row?.exchange_date || '');
  const [bccRate, setBccRate] = useState(row?.bcc_rate ?? '0.0000');
  const [bankRate, setBankRate] = useState(row?.bank_rate ?? '0.0000');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bankId || !currencyId || !exchangeDate) {
      setError('Bank, currency, and date are required.');
      return;
    }
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/v1/bank-exchange-rates/${row!.id}`
      : '/api/v1/bank-exchange-rates';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_id: parseInt(bankId, 10),
          currency_id: parseInt(currencyId, 10),
          exchange_date: exchangeDate,
          bcc_rate: bccRate,
          bank_rate: bankRate,
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
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Rate Entry' : 'Create Rate Entry'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900"
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
          <div>
            <label className="label">Bank *</label>
            <SearchableSelect
              value={bankId}
              onChange={setBankId}
              options={banks.map((b) => ({
                value: String(b.id),
                label: `${b.bank_code} — ${b.bank_name}`,
              }))}
              placeholder="Select bank..."
            />
            <p className="text-xs text-slate-500 mt-1">
              Only banks flagged &quot;for exchange&quot; appear here.
            </p>
          </div>
          <div>
            <label className="label">Currency *</label>
            <SearchableSelect
              value={currencyId}
              onChange={setCurrencyId}
              options={currencies.map((c) => ({
                value: String(c.id),
                label: c.currency_short_name || c.currency_name,
              }))}
              placeholder="Select currency..."
            />
          </div>
          <div>
            <label className="label">Exchange Date *</label>
            <input
              type="date"
              className="input"
              value={exchangeDate}
              onChange={(e) => setExchangeDate(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">BCC Rate</label>
              <input
                type="number"
                step="0.0001"
                className="input font-mono"
                value={bccRate}
                onChange={(e) => setBccRate(e.target.value)}
                placeholder="2750.0000"
              />
              <p className="text-xs text-slate-500 mt-1">
                Official BCC published rate.
              </p>
            </div>
            <div>
              <label className="label">Bank Rate</label>
              <input
                type="number"
                step="0.0001"
                className="input font-mono"
                value={bankRate}
                onChange={(e) => setBankRate(e.target.value)}
                placeholder="2780.0000"
              />
              <p className="text-xs text-slate-500 mt-1">
                Actual rate the bank used.
              </p>
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
