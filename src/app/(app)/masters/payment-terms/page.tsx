'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import { safeFetchJson } from '@/lib/safeFetch';

interface Row {
  id: number;
  payment_term_name: string;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function PaymentTermsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ q: search, page: String(page), pageSize: String(pageSize) });
    const res = await safeFetchJson<Row[]>(`/api/v1/payment-terms?${params}`);
    if (res.ok) {
      setItems(res.data);
      setTotal(typeof res.meta?.total === 'number' ? res.meta.total : res.data.length);
    }
    setLoading(false);
  }, [page, pageSize, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function handleDelete(row: Row) {
    if (!confirm(`Disable "${row.payment_term_name}"?`)) return;
    const res = await safeFetchJson(`/api/v1/payment-terms/${row.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: res.message, detail: res.detail });
      return;
    }
    setResult({
      status: 'success',
      title: 'Deleted',
      message: `"${row.payment_term_name}" has been disabled. Restore it from the Recycle Bin if you need it back.`,
    });
    load();
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Payment Terms</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Payment Term
        </button>
      </div>

      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search payment term..."
        emptyMessage="No payment term yet — create the first one."
        columns={[{ key: 'payment_term_name', header: 'Payment Term', sortable: true, className: 'font-medium' }]}
        actions={(r) => ({ edit: () => setEditing(r), remove: () => handleDelete(r) })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          search,
          onSearchChange: (q) => { setSearch(q); setPage(1); },
        }}
      />

      {showCreate && (
        <FormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The payment term has been created.' });
          }}
        />
      )}

      {editing && (
        <FormModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this payment term have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormModal({ row, onClose, onSaved }: { row?: Row; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!row;
  const [value, setValue] = useState(row?.payment_term_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Skip the check while the value is unchanged — otherwise editing a row
  // reports it as a duplicate of itself.
  const checkValue = isEdit && value === row?.payment_term_name ? '' : value;
  const { status: uniqueStatus, message: uniqueMessage } = useUniqueCheck({
    resource: 'payment-terms',
    value: checkValue,
    excludeId: row?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (uniqueStatus === 'taken') {
      setError('That payment term already exists.');
      return;
    }
    setSaving(true);
    setError(null);

    const res = await safeFetchJson(
      isEdit ? `/api/v1/payment-terms/${row!.id}` : '/api/v1/payment-terms',
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_term_name: value }),
      },
    );
    setSaving(false);

    if (!res.ok) {
      setError(res.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold text-foreground">
            {isEdit ? 'Edit Payment Term' : 'Create Payment Term'}
          </h2>
          <button type="button" onClick={onClose} title="Close" className="ico">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3 p-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}
          <div>
            <label className="label required" htmlFor="payment_term_name">Payment Term</label>
            <input
              id="payment_term_name"
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              maxLength={100}
              autoFocus
            />
            <UniquenessIndicator status={uniqueStatus} message={uniqueMessage} />
          </div>
          {/* §4.21 — a labelled way out, in every mode. */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || uniqueStatus === 'taken'} className="btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
