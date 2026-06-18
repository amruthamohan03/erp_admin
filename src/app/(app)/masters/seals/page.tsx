'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Download,
  Edit2,
  ExternalLink,
  FileDown,
  Package,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';

interface OfficeOption {
  id: number;
  location_name: string;
}

interface BatchRow {
  id: number;
  office_location_id: number | null;
  location_name: string | null;
  sub_office_code: string | null;
  purchase_date: string | null;
  total_amount: string | null;
  total_seal: number;
  added_seals: number;
  display: 'Y' | 'N';
}

interface Stats {
  total_seals: number;
  added_seals: number;
  used_seals: number;
  damaged_seals: number;
  location_counts: Array<{
    id: number;
    location_name: string;
    seal_count: number;
    added_count: number;
  }>;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'Available', label: 'Available' },
  { value: 'Used', label: 'Used' },
  { value: 'Damaged', label: 'Damaged' },
];

export default function SealsListPage() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [offices, setOffices] = useState<OfficeOption[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filterOffice, setFilterOffice] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<BatchRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/v1/seals/stats');
    const json = await res.json();
    if (json.ok) setStats(json.data);
  }, []);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterOffice) params.set('office_location_id', filterOffice);
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/v1/seals?${params}`);
      const json = await res.json();
      if (json.ok) setBatches(json.data);
      else setError(json.error?.message ?? 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, [filterOffice, filterStatus]);

  // Offices for the picker — small list, fetch once.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/offices?pageSize=100')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setOffices(j.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBatches();
    loadStats();
  }, [loadBatches, loadStats]);

  async function handleDelete(id: number) {
    if (!confirm('Soft-delete this batch and all its seal numbers?')) return;
    const res = await fetch(`/api/v1/seals/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      alert(json.error?.message ?? 'Failed');
      return;
    }
    loadBatches();
    loadStats();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary-600" />
          Seal Batches
        </h1>
        <div className="flex gap-2">
          <a
            href="/api/v1/seals/export-all"
            target="_blank"
            rel="noopener"
            className="btn-secondary"
          >
            <FileDown className="h-4 w-4" /> Export all
          </a>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> New Batch
          </button>
        </div>
      </div>

      {/* Stats banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="Total budgeted"
          value={stats?.total_seals ?? '—'}
        />
        <StatCard
          icon={<Package className="h-5 w-5" />}
          label="Added"
          value={stats?.added_seals ?? '—'}
        />
        <StatCard
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Used"
          value={stats?.used_seals ?? '—'}
        />
        <StatCard
          icon={<TriangleAlert className="h-5 w-5" />}
          label="Damaged"
          value={stats?.damaged_seals ?? '—'}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div className="text-sm text-slate-600 me-2">Filters:</div>
          <div className="min-w-[200px]">
            <SearchableSelect
              value={filterOffice}
              onChange={(v) => setFilterOffice(v)}
              options={offices.map((o) => ({
                value: String(o.id),
                label: o.location_name,
              }))}
              placeholder="All offices"
              emptyLabel="All offices"
            />
          </div>
          <select
            className="input max-w-[180px]"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Office</th>
                <th>Sub-Office</th>
                <th>Purchase Date</th>
                <th className="text-right">Total Amount</th>
                <th className="text-right">Budget</th>
                <th className="text-right">Added</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500 py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && batches.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500 py-8">
                    No seal batches.
                  </td>
                </tr>
              )}
              {!loading &&
                batches.map((b, idx) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="text-slate-500 font-medium">{idx + 1}</td>
                    <td className="font-medium">{b.location_name ?? '—'}</td>
                    <td className="text-slate-500">{b.sub_office_code ?? '—'}</td>
                    <td>{b.purchase_date ?? '—'}</td>
                    <td className="text-right font-mono">{b.total_amount ?? '0'}</td>
                    <td className="text-right">{b.total_seal}</td>
                    <td className="text-right">
                      <span
                        className={
                          b.added_seals >= b.total_seal
                            ? 'text-emerald-600 font-medium'
                            : 'text-slate-600'
                        }
                      >
                        {b.added_seals} / {b.total_seal}
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        href={`/masters/seals/${b.id}`}
                        className="text-slate-500 hover:text-primary-600 p-1 inline-block"
                        title="Manage numbers"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <a
                        href={`/api/v1/seals/${b.id}/export`}
                        target="_blank"
                        rel="noopener"
                        className="text-slate-500 hover:text-primary-600 p-1 inline-block ml-1"
                        title="Export XLSX"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        onClick={() => setEditing(b)}
                        className="text-slate-500 hover:text-primary-600 p-1 ml-1"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(b.id)}
                        className="text-slate-500 hover:text-red-600 p-1 ml-1"
                        title="Soft delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <SealBatchFormModal
          offices={offices}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            loadBatches();
            loadStats();
          }}
        />
      )}

      {editing && (
        <SealBatchFormModal
          offices={offices}
          batch={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadBatches();
            loadStats();
          }}
        />
      )}
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="text-xl font-bold text-slate-900 truncate">{value}</div>
      </div>
    </div>
  );
}

const SEAL_UNIT_PRICE = 10;

function SealBatchFormModal({
  offices,
  batch,
  onClose,
  onSaved,
}: {
  offices: OfficeOption[];
  batch?: BatchRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!batch;
  const [form, setForm] = useState({
    office_location_id: batch ? String(batch.office_location_id ?? '') : '',
    purchase_date: batch?.purchase_date ?? '',
    sub_office_code: batch?.sub_office_code ?? '',
    total_amount: batch?.total_amount ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const previewTotalSeal = (() => {
    const n = Number(form.total_amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n / SEAL_UNIT_PRICE);
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/v1/seals/${batch!.id}` : '/api/v1/seals';
    const method = isEdit ? 'PUT' : 'POST';
    const payload = {
      office_location_id: Number(form.office_location_id),
      purchase_date: form.purchase_date,
      sub_office_code: form.sub_office_code.trim() || null,
      total_amount: Number(form.total_amount),
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Save failed');
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
            {isEdit ? 'Edit Seal Batch' : 'New Seal Batch'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">
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
            <label className="label">Office *</label>
            <SearchableSelect
              value={form.office_location_id}
              onChange={(v) => setForm({ ...form, office_location_id: v })}
              options={offices.map((o) => ({
                value: String(o.id),
                label: o.location_name,
              }))}
              placeholder="Pick an office..."
              emptyLabel="— Select an office —"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Purchase Date *</label>
              <input
                type="date"
                className="input"
                value={form.purchase_date}
                onChange={(e) =>
                  setForm({ ...form, purchase_date: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="label">Sub-Office Code</label>
              <input
                className="input"
                value={form.sub_office_code}
                onChange={(e) =>
                  setForm({ ...form, sub_office_code: e.target.value })
                }
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <label className="label">Total Amount *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input"
              value={form.total_amount}
              onChange={(e) =>
                setForm({ ...form, total_amount: e.target.value })
              }
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Buys {previewTotalSeal} seal{previewTotalSeal === 1 ? '' : 's'} at $
              {SEAL_UNIT_PRICE} each.
            </p>
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
