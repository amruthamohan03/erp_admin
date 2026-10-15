'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import SearchableSelect from '@/components/ui/SearchableSelect';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions, type MasterOption } from '@/lib/selectOptions';

interface Row {
  id: number;
  payment_subtype: string;
  payment_method_id: number | null;
  payment_method_name: string | null;
  payment_type_id: number | null;
  payment_type_name: string | null;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function PaymentSubtypesPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [methods, setMethods] = useState<MasterOption[]>([]);
  const [types, setTypes] = useState<MasterOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ q: search, page: String(page), pageSize: String(pageSize) });
    const res = await safeFetchJson<Row[]>(`/api/v1/payment-subtypes?${params}`);
    if (res.ok) {
      setItems(res.data);
      setTotal(typeof res.meta?.total === 'number' ? res.meta.total : res.data.length);
    }
    setLoading(false);
  }, [page, pageSize, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchMasterOptions('payment-methods', 'payment_method_name').then(setMethods);
    fetchMasterOptions('payment-types', 'payment_type_name').then(setTypes);
  }, []);

  async function handleDelete(row: Row) {
    if (!confirm(`Disable "${row.payment_subtype}"?`)) return;
    const res = await safeFetchJson(`/api/v1/payment-subtypes/${row.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: res.message, detail: res.detail });
      return;
    }
    setResult({
      status: 'success',
      title: 'Deleted',
      message: `"${row.payment_subtype}" has been disabled. Restore it from the Recycle Bin if you need it back.`,
    });
    load();
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Payment Subtypes</h1>
      </div>

      <DataTable<Row>
        exportHref={`/api/v1/masters/payment-subtypes/export?q=${encodeURIComponent(search)}`}
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search subtype, payment method..."
        emptyMessage="No payment subtype yet — create the first one."
        toolbar={
          // §4.35 — the create action belongs to the list it adds to.
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Payment Subtype
          </button>
        }
        columns={[
          { key: 'payment_subtype', header: 'Payment Subtype', sortable: true, className: 'font-medium' },
          {
            key: 'payment_method_name',
            header: 'Payment Method',
            sortable: true,
            render: (r) => r.payment_method_name ?? '—',
          },
          {
            key: 'payment_type_name',
            header: 'Payment Type',
            sortable: true,
            render: (r) => r.payment_type_name ?? '—',
          },
        ]}
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
          methods={methods}
          types={types}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The payment subtype has been created.' });
          }}
        />
      )}

      {editing && (
        <FormModal
          row={editing}
          methods={methods}
          types={types}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this payment subtype have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormModal({
  row,
  methods,
  types,
  onClose,
  onSaved,
}: {
  row?: Row;
  methods: MasterOption[];
  types: MasterOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [value, setValue] = useState(row?.payment_subtype ?? '');
  const [methodId, setMethodId] = useState(row?.payment_method_id ? String(row.payment_method_id) : '');
  const [typeId, setTypeId] = useState(row?.payment_type_id ? String(row.payment_type_id) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A name only has to be unique within its Payment Method. Skip the check while
  // neither the name nor the method has moved — otherwise editing a row reports
  // it as a duplicate of itself — and until a method is picked to scope it.
  const unchanged =
    isEdit && value === row?.payment_subtype && methodId === String(row?.payment_method_id ?? '');
  const { status: uniqueStatus, message: uniqueMessage } = useUniqueCheck({
    resource: 'payment-subtypes',
    value: unchanged || !methodId ? '' : value,
    excludeId: row?.id ?? null,
    scopeId: methodId ? Number(methodId) : null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!methodId) {
      setError('Payment Method is required.');
      return;
    }
    if (uniqueStatus === 'taken') {
      setError('That payment subtype already exists under this payment method.');
      return;
    }
    setSaving(true);
    setError(null);

    const res = await safeFetchJson(
      isEdit ? `/api/v1/payment-subtypes/${row!.id}` : '/api/v1/payment-subtypes',
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_subtype: value,
          payment_method_id: Number(methodId),
          payment_type_id: typeId ? Number(typeId) : null,
        }),
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
            {isEdit ? 'Edit Payment Subtype' : 'Create Payment Subtype'}
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
            <label className="label required" htmlFor="payment_method_id">Payment Method</label>
            <SearchableSelect
              id="payment_method_id"
              value={methodId}
              onChange={setMethodId}
              options={methods.map((m) => ({ value: String(m.id), label: m.label }))}
              placeholder="Select payment method"
              required
              aria-label="Payment Method"
            />
          </div>
          <div>
            <label className="label required" htmlFor="payment_subtype">Payment Subtype</label>
            <input
              id="payment_subtype"
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              maxLength={100}
              autoFocus
            />
            <UniquenessIndicator status={uniqueStatus} message={uniqueMessage} />
          </div>
          <div>
            <label className="label" htmlFor="payment_type_id">Payment Type</label>
            <SearchableSelect
              id="payment_type_id"
              value={typeId}
              onChange={setTypeId}
              options={types.map((t) => ({ value: String(t.id), label: t.label }))}
              emptyLabel="None"
              placeholder="Export / Import (optional)"
              aria-label="Payment Type"
            />
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
