'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { formatDate, todayIso } from '@/lib/formatDate';
import { formatRate } from '@/lib/exchangeRates';
import { fetchMasterOptions } from '@/lib/selectOptions';
import { safeFetchJson } from '@/lib/safeFetch';

// §4.1 — the day's reference rates: what the BCC published, and the rate
// declarations are filed at.
//
// Entered once per day per currency, and read by the Bank Exchange Rate board
// so the BCC is not typed again on every bank row (§4.10).

interface Row {
  id: number;
  rate_date: string;
  currency_id: number;
  currency_name: string | null;
  declaration_rate: string | null;
  bcc_rate: string | null;
  display: 'Y' | 'N';
  updated_at: string | null;
}

/** The currency the agency's rates are quoted into, per the brief. */
const DEFAULT_CURRENCY = 'CDF';

export default function ExchangeRateMasterPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [currencies, setCurrencies] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // §4.10 — the shared option fetcher, never a private copy.
      const rows = await fetchMasterOptions('currencies', 'currency_short_name');
      if (!cancelled) setCurrencies(rows.map((r) => ({ value: String(r.id), label: r.label })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      q: search,
      page: String(page),
      pageSize: String(pageSize),
    });
    const res = await safeFetchJson<Row[]>(`/api/v1/exchange-rates?${params}`);
    if (res.ok) {
      setItems(res.data);
      setTotal((res.meta as { total?: number } | undefined)?.total ?? 0);
      setLoadError(null);
    } else {
      // A failed load must not render as an empty table — "no rates on file"
      // and "the server did not answer" look identical otherwise.
      setItems([]);
      setTotal(0);
      setLoadError(res.message || 'The exchange rates could not be loaded.');
    }
    setLoading(false);
  }, [page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(row: Row) {
    if (!confirm(`Remove the rates for ${formatDate(row.rate_date)}?`)) return;
    const res = await safeFetchJson<{ id: number }>(`/api/v1/exchange-rates/${row.id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      setResult({
        status: 'error',
        title: 'Not deleted',
        message: res.message || 'These rates could not be removed.',
      });
      return;
    }
    setResult({
      status: 'success',
      title: 'Deleted',
      message: `The rates for ${formatDate(row.rate_date)} have been removed.`,
    });
    load();
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Exchange Rate</h1>
      </div>

      {loadError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {loadError}
        </div>
      )}

      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search date, currency..."
        emptyMessage="No exchange rates yet — add today's declaration and BCC rates."
        toolbar={
          // §4.35 — the create action belongs to the list it adds to.
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Rate
          </button>
        }
        columns={[
          {
            key: 'rate_date',
            header: 'Date',
            sortable: true,
            // §4.19 — a column whose key names a date needs a render.
            render: (r) => formatDate(r.rate_date),
          },
          { key: 'currency_name', header: 'Currency', sortable: true },
          {
            key: 'declaration_rate',
            header: 'Declaration Rate',
            align: 'right' as const,
            sortable: true,
            className: 'font-mono tabular-nums',
            render: (r) => formatRate(r.declaration_rate === null ? null : Number(r.declaration_rate)),
          },
          {
            key: 'bcc_rate',
            header: 'BCC Rate',
            align: 'right' as const,
            sortable: true,
            className: 'font-mono tabular-nums',
            render: (r) => formatRate(r.bcc_rate === null ? null : Number(r.bcc_rate)),
          },
        ]}
        actions={(r) => ({ edit: () => setEditing(r), remove: () => handleDelete(r) })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => {
            setPageSize(n);
            setPage(1);
          },
          search,
          onSearchChange: (q) => {
            setSearch(q);
            setPage(1);
          },
        }}
      />

      {(showCreate || editing) && (
        <FormModal
          row={editing ?? undefined}
          currencies={currencies}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
          onSaved={(created) => {
            setShowCreate(false);
            setEditing(null);
            load();
            setResult({
              status: 'success',
              title: created ? 'Created' : 'Saved',
              message: created
                ? 'The rates have been added. The Bank Exchange Rate board will offer them for that day.'
                : 'Your changes to these rates have been saved.',
            });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormModal({
  row,
  currencies,
  onClose,
  onSaved,
}: {
  row?: Row;
  currencies: { value: string; label: string }[];
  onClose: () => void;
  onSaved: (created: boolean) => void;
}) {
  const isEdit = !!row;
  // Today, prefilled — the rates are entered on the day they are published, so
  // the common case should need no typing.
  const [rateDate, setRateDate] = useState(row?.rate_date?.slice(0, 10) ?? todayIso());
  const [currencyId, setCurrencyId] = useState(row ? String(row.currency_id) : '');
  const [declarationRate, setDeclarationRate] = useState(row?.declaration_rate ?? '');
  const [bccRate, setBccRate] = useState(row?.bcc_rate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Default to CDF once the options arrive, and only on a create — an edit
  // must keep the currency the row was saved with.
  useEffect(() => {
    if (isEdit || currencyId || currencies.length === 0) return;
    const cdf = currencies.find((c) => c.label.toUpperCase() === DEFAULT_CURRENCY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cdf) setCurrencyId(cdf.value);
  }, [currencies, currencyId, isEdit]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await safeFetchJson<{ id: number }>(
      isEdit ? `/api/v1/exchange-rates/${row!.id}` : '/api/v1/exchange-rates',
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate_date: rateDate,
          currency_id: Number(currencyId),
          declaration_rate: declarationRate || null,
          bcc_rate: bccRate || null,
        }),
      },
    );
    setSaving(false);

    if (!res.ok) {
      // The server's sentence first — it names the field and the fix (§4.23).
      setError(res.message || 'These rates could not be saved.');
      return;
    }
    onSaved(!isEdit);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">{isEdit ? 'Edit Exchange Rate' : 'New Exchange Rate'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3 p-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label required">Date</label>
              {/* §4.19 — the input is fed ISO; only DISPLAY is DD-MM-YYYY. */}
              <input
                type="date"
                className="input"
                value={rateDate}
                onChange={(e) => setRateDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label required">Currency</label>
              {/* §4.16 — pick-one is a SearchableSelect, never a raw select. */}
              <SearchableSelect
                value={currencyId}
                onChange={setCurrencyId}
                options={currencies}
                placeholder="Currency"
                aria-label="Currency"
              />
            </div>
          </div>

          <div>
            <label className="label">Declaration Rate</label>
            <input
              className="input text-right font-mono"
              type="number"
              step="0.0001"
              min="0"
              value={declarationRate}
              onChange={(e) => setDeclarationRate(e.target.value)}
              placeholder="2850.0000"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The rate customs declarations are filed at for this day.
            </p>
          </div>

          <div>
            <label className="label">BCC Rate</label>
            <input
              className="input text-right font-mono"
              type="number"
              step="0.0001"
              min="0"
              value={bccRate}
              onChange={(e) => setBccRate(e.target.value)}
              placeholder="2800.0000"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              What the Banque Centrale du Congo published. Offered on the Bank Exchange Rate board
              for this day.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {/* §4.21 — a labelled way out, in every mode. */}
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving || !currencyId} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
