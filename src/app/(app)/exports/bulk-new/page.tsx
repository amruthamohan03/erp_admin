'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Layers,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import SealPickerControl from '@/components/ui/SealPickerControl';

// No. of Seals is derived from the comma-joined seal numbers — same rule the
// single form applies via its `count` derive on dgda_seal_no.
const sealCount = (s: string): number =>
  s.split(',').map((x) => x.trim()).filter(Boolean).length;

// /exports/bulk-new — grid-based multi-row export creation against
// ONE license. Mirrors main's export/bulk-new but simplified for
// this branch: no config-driven charge computation, no seal
// reservation (see the bulk-create endpoint comment for rationale).
//
// Layout:
//   Header — client + license picker, live usage bar, MCA prefix
//   Grid — one row per export, add/remove, editable inputs
//   Footer — totals + submit
//
// Cap enforcement is done both client-side (row-by-row live sum vs
// remaining) and server-side (authoritative — the batch fails if
// the numbers don't match at commit time).

interface Option {
  value: string;
  label: string;
}

interface LicenseUsage {
  license_id: number;
  license_no: string;
  client_id: number;
  amount: number | null;
  used_fob_total: number;
  remaining_fob: number | null;
}

interface GridRow {
  loading_date: string;
  weight: string;
  fob: string;
  horse: string;
  trailer_1: string;
  trailer_2: string;
  container: string;
  destination: string;
  lot_number: string;
  dgda_seal_no: string;
  number_of_bags: string;
}

const EMPTY_ROW: GridRow = {
  loading_date: '',
  weight: '',
  fob: '',
  horse: '',
  trailer_1: '',
  trailer_2: '',
  container: '',
  destination: '',
  lot_number: '',
  dgda_seal_no: '',
  number_of_bags: '',
};

const nonEmpty = (s: string): string | null =>
  s.trim() === '' ? null : s.trim();
const nonEmptyNum = (s: string): number | undefined =>
  s.trim() === '' ? undefined : Number(s);

function fmtMoney(n: number | null): string {
  if (n == null) return '∞';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2 });
}

export default function BulkNewExportsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Option[]>([]);
  const [licenses, setLicenses] = useState<Array<Option & { clientId: string }>>([]);
  const [clientId, setClientId] = useState<string>('');
  const [licenseId, setLicenseId] = useState<string>('');
  const [usage, setUsage] = useState<LicenseUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const [mcaPrefix, setMcaPrefix] = useState('');
  const [rows, setRows] = useState<GridRow[]>([{ ...EMPTY_ROW }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load pickers on mount. Both are small (<2k rows each) so a
  // single unpaginated fetch is fine.
  useEffect(() => {
    (async () => {
      const [cRes, lRes] = await Promise.all([
        // clients caps pageSize at 100; an over-cap value 422s and yields no
        // options. licenses allows up to 500.
        fetch('/api/v1/clients?pageSize=100').then((r) => r.json()),
        fetch('/api/v1/licenses?pageSize=500').then((r) => r.json()),
      ]);
      if (cRes.ok) {
        setClients(
          // Show the client short_name (fall back to company_name if absent).
          (cRes.data as { id: number; company_name: string; short_name: string | null }[]).map((c) => ({
            value: String(c.id),
            label: c.short_name || c.company_name,
          })),
        );
      }
      if (lRes.ok) {
        setLicenses(
          (
            lRes.data as { id: number; license_number?: string; license_no?: string; client_id?: number }[]
          ).map((l) => ({
            value: String(l.id),
            label: l.license_number ?? l.license_no ?? `#${l.id}`,
            clientId: l.client_id != null ? String(l.client_id) : '',
          })),
        );
      }
    })();
  }, []);

  // Load license usage whenever the license changes. Empty out
  // usage when license is cleared so the header stops showing
  // stale numbers.
  const loadUsage = useCallback(async (id: string) => {
    if (!id) {
      setUsage(null);
      return;
    }
    setUsageLoading(true);
    try {
      const res = await fetch(`/api/v1/licenses/${id}/usage`);
      const json = await res.json();
      if (json.ok) setUsage(json.data as LicenseUsage);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsage(licenseId);
  }, [licenseId, loadUsage]);

  // Client-side batch total (informational — server re-checks).
  const batchFob = useMemo(
    () =>
      rows.reduce(
        (s, r) => s + (r.fob.trim() === '' ? 0 : Number(r.fob)),
        0,
      ),
    [rows],
  );
  const batchWeight = useMemo(
    () =>
      rows.reduce(
        (s, r) => s + (r.weight.trim() === '' ? 0 : Number(r.weight)),
        0,
      ),
    [rows],
  );

  const capExceeded =
    usage?.remaining_fob != null && batchFob > usage.remaining_fob;

  function updateRow(idx: number, patch: Partial<GridRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }
  function removeRow(idx: number) {
    setRows((prev) =>
      prev.length === 1
        ? [{ ...EMPTY_ROW }]
        : prev.filter((_, i) => i !== idx),
    );
  }

  async function submit() {
    setError(null);

    if (!clientId || !licenseId) {
      setError('Client and license are required.');
      return;
    }
    if (!mcaPrefix.trim()) {
      setError('MCA reference prefix is required.');
      return;
    }
    if (rows.every((r) => (r.fob.trim() === '' ? 0 : Number(r.fob)) <= 0)) {
      setError('At least one row must carry a positive FOB.');
      return;
    }

    const body = {
      common: {
        client_id: Number(clientId),
        license_id: Number(licenseId),
        mca_ref_prefix: mcaPrefix.trim(),
      },
      rows: rows.map((r) => ({
        loading_date: nonEmpty(r.loading_date),
        weight: nonEmptyNum(r.weight),
        fob: nonEmptyNum(r.fob),
        horse: nonEmpty(r.horse),
        trailer_1: nonEmpty(r.trailer_1),
        trailer_2: nonEmpty(r.trailer_2),
        container: nonEmpty(r.container),
        destination: nonEmpty(r.destination),
        lot_number: nonEmpty(r.lot_number),
        dgda_seal_no: nonEmpty(r.dgda_seal_no),
        number_of_seals: sealCount(r.dgda_seal_no) || null,
        number_of_bags:
          r.number_of_bags.trim() === '' ? null : Number(r.number_of_bags),
      })),
    };

    setSaving(true);
    try {
      const res = await fetch('/api/v1/exports/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || 'Bulk create failed');
        return;
      }
      router.push('/exports');
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Layers className="h-6 w-6 text-primary-600" />
          Bulk create exports
        </h1>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary"
            type="button"
            onClick={() => router.push('/exports')}
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            className="btn-primary"
            type="button"
            onClick={submit}
            disabled={saving || capExceeded}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Create {rows.length} export{rows.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="card p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Client *</label>
            <SearchableSelect
              value={clientId}
              onChange={(v) => { setClientId(v); setLicenseId(''); }}
              options={clients}
              placeholder="Select client..."
              emptyLabel="—"
            />
          </div>
          <div>
            <label className="label">License *</label>
            <SearchableSelect
              value={licenseId}
              onChange={setLicenseId}
              options={clientId ? licenses.filter((l) => l.clientId === clientId) : licenses}
              placeholder={clientId ? 'Select license...' : 'Select client first'}
              emptyLabel="—"
            />
          </div>
          <div>
            <label className="label">MCA reference prefix *</label>
            <input
              className="input"
              value={mcaPrefix}
              onChange={(e) => setMcaPrefix(e.target.value)}
              placeholder="EXP-2026-BATCH1"
            />
            <p className="text-xs text-slate-500 mt-1">
              Each row gets <code>{`{prefix}-0001, {prefix}-0002…`}</code>
            </p>
          </div>
        </div>

        {usage && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            {usageLoading ? (
              <span className="text-slate-500">Loading license usage…</span>
            ) : (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span className="text-slate-600">
                  License cap:{' '}
                  <span className="font-mono">{fmtMoney(usage.amount)}</span>
                </span>
                <span className="text-slate-600">
                  Already used:{' '}
                  <span className="font-mono">
                    {fmtMoney(usage.used_fob_total)}
                  </span>
                </span>
                <span className="text-slate-600">
                  Remaining:{' '}
                  <span
                    className={`font-mono ${
                      usage.remaining_fob != null && usage.remaining_fob < batchFob
                        ? 'text-red-600 font-semibold'
                        : 'text-emerald-700'
                    }`}
                  >
                    {fmtMoney(usage.remaining_fob)}
                  </span>
                </span>
                <span className="text-slate-600">
                  This batch:{' '}
                  <span
                    className={`font-mono ${
                      capExceeded ? 'text-red-600 font-semibold' : ''
                    }`}
                  >
                    {fmtMoney(batchFob)}
                  </span>
                </span>
                <span className="text-slate-600">
                  Batch weight:{' '}
                  <span className="font-mono">
                    {batchWeight.toLocaleString()}
                  </span>{' '}
                  MT
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Loading date</th>
                <th>Weight</th>
                <th>FOB</th>
                <th>Horse</th>
                <th>Trailer 1</th>
                <th>Trailer 2</th>
                <th>Container</th>
                <th>Destination</th>
                <th>Lot #</th>
                <th>Bags</th>
                <th>DGDA seal</th>
                <th>No. of Seals</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="text-slate-500 text-xs">{i + 1}</td>
                  <td>
                    <input
                      type="date"
                      className="input text-xs"
                      value={r.loading_date}
                      onChange={(e) =>
                        updateRow(i, { loading_date: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-24"
                      type="number"
                      step="0.001"
                      min="0"
                      value={r.weight}
                      onChange={(e) => updateRow(i, { weight: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-28"
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.fob}
                      onChange={(e) => updateRow(i, { fob: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-20"
                      value={r.horse}
                      onChange={(e) => updateRow(i, { horse: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-20"
                      value={r.trailer_1}
                      onChange={(e) =>
                        updateRow(i, { trailer_1: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-20"
                      value={r.trailer_2}
                      onChange={(e) =>
                        updateRow(i, { trailer_2: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-24"
                      value={r.container}
                      onChange={(e) =>
                        updateRow(i, { container: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-32"
                      value={r.destination}
                      onChange={(e) =>
                        updateRow(i, { destination: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-20"
                      value={r.lot_number}
                      onChange={(e) =>
                        updateRow(i, { lot_number: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-16"
                      type="number"
                      min="0"
                      value={r.number_of_bags}
                      onChange={(e) =>
                        updateRow(i, { number_of_bags: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <SealPickerControl
                      compact
                      value={r.dgda_seal_no}
                      onChange={(v) => updateRow(i, { dgda_seal_no: v })}
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-16 bg-slate-50"
                      value={sealCount(r.dgda_seal_no) || ''}
                      readOnly
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-slate-400 hover:text-red-600 p-1"
                      title="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-slate-200 flex justify-between items-center">
          <button
            type="button"
            onClick={addRow}
            className="btn-secondary text-sm"
          >
            <Plus className="h-4 w-4" /> Add row
          </button>
          <div className="text-xs text-slate-500">
            Totals — FOB{' '}
            <span className="font-mono">{fmtMoney(batchFob)}</span>, weight{' '}
            <span className="font-mono">{batchWeight.toLocaleString()}</span> MT
          </div>
        </div>
      </div>
    </>
  );
}
