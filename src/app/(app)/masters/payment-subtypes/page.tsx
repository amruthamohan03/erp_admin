'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import ActiveToggleField from '@/components/ui/ActiveToggleField';
import { displayStatusColumn, setDisplay } from '@/lib/masters/displayToggle';
import SearchableSelect from '@/components/ui/SearchableSelect';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions, type MasterOption } from '@/lib/selectOptions';

interface Row {
  id: number;
  payment_subtype: string;
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
  const [types, setTypes] = useState<MasterOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      q: search,
      // The master lists disabled rows too, so they can be switched back on.
      include_disabled: 'true',
      page: String(page),
      pageSize: String(pageSize),
    });
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

  async function handleToggle(r: Row, active: boolean) {
    setResult(await setDisplay(`/api/v1/payment-subtypes/${r.id}`, active, r.payment_subtype));
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
        searchPlaceholder="Search subtype, payment type..."
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
            key: 'payment_type_name',
            header: 'Payment Type',
            sortable: true,
            render: (r) => r.payment_type_name ?? '—',
          },
          displayStatusColumn<Row>({ nameOf: (r) => r.payment_subtype, onToggle: handleToggle }),
        ]}
        // A disabled row has nothing left to delete — the switch re-enables it.
        actions={(r) => ({
          edit: () => setEditing(r),
          ...(r.display === 'Y' ? { remove: () => handleDelete(r) } : {}),
        })}
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
  types,
  onClose,
  onSaved,
}: {
  row?: Row;
  types: MasterOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [value, setValue] = useState(row?.payment_subtype ?? '');
  const [typeId, setTypeId] = useState(row?.payment_type_id ? String(row.payment_type_id) : '');
  const [active, setActive] = useState(row ? row.display === 'Y' : true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Skip the check while the name has not moved — otherwise editing a row
  // reports it as a duplicate of itself.
  const unchanged = isEdit && value === row?.payment_subtype;
  const { status: uniqueStatus, message: uniqueMessage } = useUniqueCheck({
    resource: 'payment-subtypes',
    value: unchanged ? '' : value,
    excludeId: row?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (uniqueStatus === 'taken') {
      setError('That payment subtype already exists.');
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
          payment_type_id: typeId ? Number(typeId) : null,
          display: active ? 'Y' : 'N',
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
          <ActiveToggleField checked={active} onChange={setActive} />
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
