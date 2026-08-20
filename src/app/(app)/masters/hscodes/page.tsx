'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

interface Row {
  id: number;
  hscode_number: string;
  hscode_ddi: string | null;
  hscode_ica: string | null;
  hscode_dci: string | null;
  hscode_dcl: string | null;
  hscode_tpi: string | null;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

const RATE_FIELDS = [
  { key: 'hscode_ddi', label: 'DDI' },
  { key: 'hscode_ica', label: 'ICA' },
  { key: 'hscode_dci', label: 'DCI' },
  { key: 'hscode_dcl', label: 'DCL' },
  { key: 'hscode_tpi', label: 'TPI' },
] as const;
type RateKey = (typeof RATE_FIELDS)[number]['key'];

function fmt(n: string | null): string {
  if (n === null || n === undefined) return '0.00';
  return n;
}

export default function HscodesPage() {
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
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/v1/hscodes?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
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
    if (!confirm('Disable this HS code?')) return;
    const res = await fetch(`/api/v1/hscodes/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This HS code could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The HS code has been disabled.' });
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">HS Codes</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New HS Code
        </button>
      </div>

      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search HS code..."
        emptyMessage="No HS codes yet — create the first one."
        columns={[
          { key: 'hscode_number', header: 'HS Code', sortable: true, className: 'font-mono' },
          ...RATE_FIELDS.map((f) => ({
            key: f.key,
            header: `${f.label} (%)`,
            align: 'right' as const,
            className: 'font-mono text-xs',
            render: (r: Row) => fmt(r[f.key as RateKey]),
          })),
        ]}
        actions={(r) => ({ edit: () => setEditing(r), remove: () => handleDelete(r.id) })}
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
            setResult({ status: 'success', title: 'Created', message: 'The HS code has been created.' });
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
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this HS code have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormModal({
  row,
  onClose,
  onSaved,
}: {
  row?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [number, setNumber] = useState(row?.hscode_number || '');
  const [rates, setRates] = useState<Record<RateKey, string>>({
    hscode_ddi: row?.hscode_ddi ?? '0.00',
    hscode_ica: row?.hscode_ica ?? '0.00',
    hscode_dci: row?.hscode_dci ?? '0.00',
    hscode_dcl: row?.hscode_dcl ?? '0.00',
    hscode_tpi: row?.hscode_tpi ?? '0.00',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkValue = isEdit && number === row?.hscode_number ? '' : number;
  const { status, message } = useUniqueCheck({
    resource: 'hscodes',
    value: checkValue,
    excludeId: row?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'taken') {
      setError('Already exists');
      return;
    }
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/v1/hscodes/${row!.id}` : '/api/v1/hscodes';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hscode_number: number,
          ...rates,
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
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">
            {isEdit ? 'Edit HS Code' : 'Create HS Code'}
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
          <div>
            <label className="label required">HS Code Number</label>
            <input
              className="input font-mono"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              required
              maxLength={100}
            />
            <UniquenessIndicator status={status} message={message} />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {RATE_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label">{f.label} (%)</label>
                <input
                  className="input text-right"
                  type="number"
                  step="0.01"
                  min="0"
                  max="999.99"
                  value={rates[f.key]}
                  onChange={(e) =>
                    setRates((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
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
