'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Edit2,
  FileBarChart,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
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

const RATES = [
  { key: 'hscode_ddi', label: 'DDI', hint: 'Import duty' },
  { key: 'hscode_ica', label: 'ICA', hint: 'Sales tax' },
  { key: 'hscode_dci', label: 'DCI', hint: 'Excise' },
  { key: 'hscode_dcl', label: 'DCL', hint: 'Export duty' },
  { key: 'hscode_tpi', label: 'TPI', hint: 'Industry promo' },
] as const;
type RateKey = (typeof RATES)[number]['key'];

function fmtRate(v: string | null): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
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

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

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
          <FileBarChart className="h-6 w-6 text-primary-600" />
          HS Codes
        </h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New HS Code
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search HS code number..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>HS Code</th>
                {RATES.map((r) => (
                  <th
                    key={r.key}
                    className="text-right whitespace-nowrap"
                    title={r.hint}
                  >
                    {r.label}
                  </th>
                ))}
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={3 + RATES.length}
                    className="text-center text-slate-500 py-8"
                  >
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={3 + RATES.length}
                    className="text-center text-slate-500 py-8"
                  >
                    No HS codes found
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-mono font-medium">
                      {r.hscode_number}
                    </td>
                    {RATES.map((rate) => (
                      <td
                        key={rate.key}
                        className="text-right font-mono text-sm"
                      >
                        {fmtRate(r[rate.key as RateKey])}
                      </td>
                    ))}
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
                        title="Disable"
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
            <label className="label">HS Code Number *</label>
            <input
              className="input font-mono"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              required
              placeholder="0101.21.00"
              maxLength={100}
            />
            <div className="mt-1 text-right">
              <UniquenessIndicator status={status} message={message} />
            </div>
          </div>
          <div>
            <label className="label">Tax rates (%)</label>
            <div className="grid grid-cols-5 gap-2 mt-1">
              {RATES.map((rate) => (
                <div key={rate.key}>
                  <label
                    className="block text-xs font-medium text-slate-600 mb-1"
                    title={rate.hint}
                  >
                    {rate.label}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="999.99"
                    className="input font-mono text-sm"
                    value={rates[rate.key]}
                    onChange={(e) =>
                      setRates((prev) => ({
                        ...prev,
                        [rate.key]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              DDI = import duty, ICA = sales tax, DCI = excise, DCL =
              export duty, TPI = industry promotion.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving || status === 'taken'} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
