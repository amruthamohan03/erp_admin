'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Truck,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import SealPickerControl from '@/components/ui/SealPickerControl';
import { fetchClientOptions } from '@/lib/clientOptions';
import { safeFetchJson } from '@/lib/safeFetch';

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
//   Header — client + licence picker, number of entries, live usage bar, and
//            the MCA references the batch will be given
//   Grid — one row per export, add/remove, editable inputs
//   Footer — totals + submit
//
// References are NOT typed here. They come from the format configured under
// Developer Options → Reference Formats, built by the same generator the
// single-record form uses (§4.33), so an export is named the same way whichever
// screen created it. The preview shows what they will be before committing.
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

/** Enough for a day's loading; past this the grid stops being usable anyway. */
const MAX_ENTRIES = 200;

const rowHasData = (r: GridRow): boolean =>
  Object.values(r).some((v) => String(v ?? '').trim() !== '');

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

  const [rows, setRows] = useState<GridRow[]>([{ ...EMPTY_ROW }]);
  // Held as a string so the field can be empty mid-typing; the grid only
  // changes when the value is committed (blur or Enter).
  const [entryCount, setEntryCount] = useState('1');
  const [previewRefs, setPreviewRefs] = useState<string[]>([]);
  const [refsLoading, setRefsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load pickers on mount. Both are small (<2k rows each) so a
  // single unpaginated fetch is fine.
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

  // §4.33 — the references this batch will actually be given, from the same
  // generator that assigns them. Re-fetched when the licence, the client or the
  // number of rows changes, since all three move the answer.
  useEffect(() => {
    if (!clientId || !licenseId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewRefs([]);
      return;
    }
    let cancelled = false;
    setRefsLoading(true);
    const params = new URLSearchParams({
      target: 'export',
      client_id: clientId,
      license_id: licenseId,
      count: String(Math.min(rows.length, 50)),
    });
    (async () => {
      const res = await safeFetchJson<{ refs: string[] }>(`/api/v1/mca-ref-formats/preview?${params}`);
      if (cancelled) return;
      setPreviewRefs(res.ok ? res.data.refs : []);
      setRefsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId, licenseId, rows.length]);

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

  // Add/remove keep the count field in step, so the header never disagrees with
  // the grid. Computed from `rows` rather than inside the updater — a state
  // updater has to stay a pure calculation.
  function addRow() {
    const next = [...rows, { ...EMPTY_ROW }];
    setRows(next);
    setEntryCount(String(next.length));
  }
  function removeRow(idx: number) {
    const next = rows.length === 1 ? [{ ...EMPTY_ROW }] : rows.filter((_, i) => i !== idx);
    setRows(next);
    setEntryCount(String(next.length));
  }

  /**
   * Resize the grid to the typed count.
   *
   * Shrinking asks first when the rows being dropped hold anything — a typo in a
   * number field should not silently discard work that is already entered
   * (§4.22 permits a confirm BEFORE a destructive action).
   */
  function applyEntryCount(raw: string) {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n < 1) {
      setEntryCount(String(rows.length));
      return;
    }
    const target = Math.min(n, MAX_ENTRIES);
    if (target === rows.length) {
      setEntryCount(String(target));
      return;
    }
    if (target < rows.length) {
      const dropped = rows.slice(target).filter(rowHasData).length;
      if (
        dropped > 0 &&
        !confirm(
          `${dropped} of the rows being removed have data entered. Reduce to ${target} entries and discard them?`,
        )
      ) {
        setEntryCount(String(rows.length));
        return;
      }
      setRows((prev) => prev.slice(0, target));
    } else {
      setRows((prev) => [...prev, ...Array.from({ length: target - prev.length }, () => ({ ...EMPTY_ROW }))]);
    }
    setEntryCount(String(target));
  }

  async function submit() {
    setError(null);

    if (!clientId || !licenseId) {
      setError('Client and license are required.');
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
        {/* Not "bulk create" any more — this is simply how an export is created.
            There is no single-entry screen to contrast it with, so naming it
            after the contrast would describe a choice that no longer exists. */}
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary-600" />
          New Export Tracking
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
            <label className="label required" htmlFor="entry_count">
              No. of export tracking entries
            </label>
            <input
              id="entry_count"
              type="number"
              required
              min={1}
              max={MAX_ENTRIES}
              className="input"
              value={entryCount}
              onChange={(e) => setEntryCount(e.target.value)}
              onBlur={() => applyEntryCount(entryCount)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyEntryCount(entryCount);
                }
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Sets how many rows the grid holds. Rows can still be added or removed below.
            </p>
          </div>
        </div>

        {/* §4.33 — the references these records will be given, from the format
            configured under Developer Options. This replaces the prefix the
            operator used to type: the numbering is no longer theirs to invent,
            but they still get to see it before committing the batch. */}
        <div className="mt-3 rounded-md border border-border bg-muted/50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            MCA references to be assigned
          </div>
          {!licenseId ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a client and licence to see the references.
            </p>
          ) : refsLoading ? (
            <p className="mt-1 text-sm text-muted-foreground">Working them out…</p>
          ) : previewRefs.length === 0 ? (
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              The reference cannot be built — this licence is missing its kind, type of goods or
              transport mode, or the client has no short code. Complete the licence first.
            </p>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {previewRefs.slice(0, 12).map((ref) => (
                <span
                  key={ref}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                >
                  {ref}
                </span>
              ))}
              {previewRefs.length > 12 && (
                <span className="text-xs text-muted-foreground">
                  +{previewRefs.length - 12} more
                </span>
              )}
            </div>
          )}
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
                  <td className="text-muted-foreground text-xs">{i + 1}</td>
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
                      className="input text-xs w-16 bg-muted/50"
                      value={sealCount(r.dgda_seal_no) || ''}
                      readOnly
                      placeholder="0"
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
