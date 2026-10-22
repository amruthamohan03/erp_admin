'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import ActiveToggleField from '@/components/ui/ActiveToggleField';
import { displayStatusColumn, setDisplay } from '@/lib/masters/displayToggle';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';
import { safeFetchJson } from '@/lib/safeFetch';

interface Row {
  id: number;
  bank_name: string;
  bank_code: string;
  for_exchange: 'Y' | 'N';
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function BanksPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        // The master lists disabled rows too, so they can be switched back on.
        include_disabled: 'true',
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await safeFetchJson<Row[]>(`/api/v1/banks?${params}`);
      if (res.ok) {
        setItems(res.data);
        setTotal(typeof res.meta?.total === 'number' ? res.meta.total : 0);
      } else {
        setResult({ status: 'error', title: 'Not loaded', message: res.message, detail: res.detail });
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Disable this bank?')) return;
    const res = await safeFetchJson(`/api/v1/banks/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: res.message, detail: res.detail });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The bank has been disabled.' });
    load();
  }

  async function handleToggle(r: Row, active: boolean) {
    setResult(await setDisplay(`/api/v1/banks/${r.id}`, active, r.bank_name));
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Banks</h1>
      </div>

      <DataTable<Row>
        exportHref={`/api/v1/masters/banks/export?q=${encodeURIComponent(search)}`}
        rows={items}
        loading={loading}
        rowKey={(b) => b.id}
        searchPlaceholder="Search bank name, code..."
        emptyMessage="No banks yet — create the first one."
        toolbar={
          // §4.35 — the create action belongs to the list it adds to.
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Bank
          </button>
        }
        columns={[
        { key: 'bank_name', header: 'Bank Name', sortable: true, className: 'font-medium' },
        { key: 'bank_code', header: 'Bank Code', sortable: true },
        { key: 'for_exchange', header: 'For Exchange', render: (b: Row) => (
            <>
            <Flag on={b.for_exchange === 'Y'} />
            </>
          ) },
          displayStatusColumn<Row>({ nameOf: (b) => b.bank_name, onToggle: handleToggle }),
        ]}
        // A disabled row has nothing left to delete — the switch re-enables it.
        actions={(b) => ({
          edit: () => setEditing(b),
          ...(b.display === 'Y' ? { remove: () => handleDelete(b.id) } : {}),
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
        <BankFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The bank has been created.' });
          }}
        />
      )}

      {editing && (
        <BankFormModal
          bank={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this bank have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function Flag({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${on ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}
    >
      {on ? 'Yes' : 'No'}
    </span>
  );
}

function BankFormModal({
  bank,
  onClose,
  onSaved,
}: {
  bank?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!bank;
  const [active, setActive] = useState(bank ? bank.display === 'Y' : true);
  const [form, setForm] = useState({
    bank_name: bank?.bank_name || '',
    bank_code: bank?.bank_code || 'N/A',
    for_exchange: bank?.for_exchange === 'Y',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkValue =
    isEdit && form.bank_name === bank?.bank_name ? '' : form.bank_name;
  const { status, message } = useUniqueCheck({
    resource: 'banks',
    value: checkValue,
    excludeId: bank?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'taken') {
      setError('Already exists');
      return;
    }
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/v1/banks/${bank!.id}` : '/api/v1/banks';
    const method = isEdit ? 'PUT' : 'POST';

    const payload = {
      bank_name: form.bank_name,
      bank_code: form.bank_code,
      for_exchange: form.for_exchange ? 'Y' : 'N',
      display: active ? 'Y' : 'N',
    };

    try {
      const res = await safeFetchJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Bank' : 'Create Bank'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">
              {error}
            </div>
          )}
          <div>
            <label className="label required">Bank Name</label>
            <input
              className="input"
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              required
            />
            <UniquenessIndicator status={status} message={message} />
          </div>
          <div>
            <label className="label required">Bank Code</label>
            <input
              className="input"
              value={form.bank_code}
              onChange={(e) => setForm({ ...form, bank_code: e.target.value })}
              required
              maxLength={20}
            />
          </div>
          <div>
            <Toggle
              checked={form.for_exchange}
              onChange={(v) => setForm({ ...form, for_exchange: v })}
              label="For Exchange"
            />
          </div>
          <ActiveToggleField checked={active} onChange={setActive} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || status === 'taken'}
              className="btn-primary"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
