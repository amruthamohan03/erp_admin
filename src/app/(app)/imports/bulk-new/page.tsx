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
import { fetchClientOptions } from '@/lib/clientOptions';

// /imports/bulk-new — sibling of /exports/bulk-new. Same overall
// shape (client + license + MCA prefix header, editable row grid,
// live cap check) but with import-side columns. The license usage
// endpoint reflects both imports + exports on the same license so
// the "remaining" figure is shared between the two flows.

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
  pre_alert_date: string;
  weight: string;
  fob: string;
  invoice: string;
  po_ref: string;
  supplier: string;
  road_manif: string;
  airway_bill: string;
  container: string;
  horse: string;
  trailer_1: string;
}

const EMPTY_ROW: GridRow = {
  pre_alert_date: '',
  weight: '',
  fob: '',
  invoice: '',
  po_ref: '',
  supplier: '',
  road_manif: '',
  airway_bill: '',
  container: '',
  horse: '',
  trailer_1: '',
};

const nonEmpty = (s: string): string | null =>
  s.trim() === '' ? null : s.trim();
const nonEmptyNum = (s: string): number | undefined =>
  s.trim() === '' ? undefined : Number(s);

function fmtMoney(n: number | null): string {
  if (n == null) return '∞';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2 });
}

export default function BulkNewImportsPage() {
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

  useEffect(() => {
    (async () => {
      const [clientOpts, lRes] = await Promise.all([
        // Clients are labelled by short code, via the shared helper (§4.15).
        // licenses allows pageSize up to 500.
        fetchClientOptions(),
        fetch('/api/v1/licenses?pageSize=500').then((r) => r.json()),
      ]);
      setClients(clientOpts);
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
      prev.length === 1 ? [{ ...EMPTY_ROW }] : prev.filter((_, i) => i !== idx),
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
        pre_alert_date: nonEmpty(r.pre_alert_date),
        weight: nonEmptyNum(r.weight),
        fob: nonEmptyNum(r.fob),
        invoice: nonEmpty(r.invoice),
        po_ref: nonEmpty(r.po_ref),
        supplier: nonEmpty(r.supplier),
        road_manif: nonEmpty(r.road_manif),
        airway_bill: nonEmpty(r.airway_bill),
        container: nonEmpty(r.container),
        horse: nonEmpty(r.horse),
        trailer_1: nonEmpty(r.trailer_1),
      })),
    };

    setSaving(true);
    try {
      const res = await fetch('/api/v1/imports/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || 'Bulk create failed');
        return;
      }
      router.push('/imports');
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Layers className="h-6 w-6 text-primary-600" />
          Bulk create imports
        </h1>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary"
            type="button"
            onClick={() => router.push('/imports')}
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
            Create {rows.length} import{rows.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="card p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label required">Client</label>
            <SearchableSelect required
              value={clientId}
              onChange={(v) => { setClientId(v); setLicenseId(''); }}
              options={clients}
              placeholder="Select client..."
              emptyLabel="—"
            />
          </div>
          <div>
            <label className="label required">License</label>
            <SearchableSelect required
              value={licenseId}
              onChange={setLicenseId}
              options={clientId ? licenses.filter((l) => l.clientId === clientId) : licenses}
              placeholder={clientId ? 'Select license...' : 'Select client first'}
              emptyLabel="—"
            />
          </div>
          <div>
            <label className="label required">MCA reference prefix</label>
            <input required
              className="input"
              value={mcaPrefix}
              onChange={(e) => setMcaPrefix(e.target.value)}
              placeholder="IMP-2026-BATCH1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Each row gets <code>{`{prefix}-0001, {prefix}-0002…`}</code>
            </p>
          </div>
        </div>

        {usage && (
          <div className="mt-4 rounded-md border border-border bg-muted/50 p-3 text-sm">
            {usageLoading ? (
              <span className="text-muted-foreground">Loading license usage…</span>
            ) : (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span className="text-muted-foreground">
                  License cap:{' '}
                  <span className="font-mono">{fmtMoney(usage.amount)}</span>
                </span>
                <span className="text-muted-foreground">
                  Already used:{' '}
                  <span className="font-mono">
                    {fmtMoney(usage.used_fob_total)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Remaining:{' '}
                  <span
                    className={`font-mono ${
                      usage.remaining_fob != null && usage.remaining_fob < batchFob
                        ? 'text-red-600 dark:text-red-400 font-semibold'
                        : 'text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {fmtMoney(usage.remaining_fob)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  This batch:{' '}
                  <span
                    className={`font-mono ${
                      capExceeded ? 'text-red-600 dark:text-red-400 font-semibold' : ''
                    }`}
                  >
                    {fmtMoney(batchFob)}
                  </span>
                </span>
                <span className="text-muted-foreground">
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
                <th>Pre-alert date</th>
                <th>Weight</th>
                <th>FOB</th>
                <th>Invoice</th>
                <th>PO ref</th>
                <th>Supplier</th>
                <th>Road manif</th>
                <th>Airway bill</th>
                <th>Container</th>
                <th>Horse</th>
                <th>Trailer 1</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="text-muted-foreground text-xs">{i + 1}</td>
                  <td>
                    <input
                      type="date"
                      className="input text-xs"
                      value={r.pre_alert_date}
                      onChange={(e) =>
                        updateRow(i, { pre_alert_date: e.target.value })
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
                      className="input text-xs w-24"
                      value={r.invoice}
                      onChange={(e) => updateRow(i, { invoice: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-20"
                      value={r.po_ref}
                      onChange={(e) => updateRow(i, { po_ref: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-32"
                      value={r.supplier}
                      onChange={(e) =>
                        updateRow(i, { supplier: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-24"
                      value={r.road_manif}
                      onChange={(e) =>
                        updateRow(i, { road_manif: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input text-xs w-24"
                      value={r.airway_bill}
                      onChange={(e) =>
                        updateRow(i, { airway_bill: e.target.value })
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
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="ico-delete"
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
        <div className="p-3 border-t border-border flex justify-between items-center">
          <button
            type="button"
            onClick={addRow}
            className="btn-secondary text-sm"
          >
            <Plus className="h-4 w-4" /> Add row
          </button>
          <div className="text-xs text-muted-foreground">
            Totals — FOB{' '}
            <span className="font-mono">{fmtMoney(batchFob)}</span>, weight{' '}
            <span className="font-mono">{batchWeight.toLocaleString()}</span> MT
          </div>
        </div>
      </div>
    </>
  );
}
