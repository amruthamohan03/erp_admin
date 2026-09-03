'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  FileText,
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
import { fetchMasterOptions, type MasterOption } from '@/lib/selectOptions';
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
//   Header — client + licence picker, number of entries, and the live licence
//            usage bar
//   Grid — one row per export, add/remove, editable inputs
//   Footer — totals + submit
//
// References are NOT typed here. They come from the format configured under
// Developer Options → Reference Formats, built by the same generator the
// single-record form uses (§4.33), so an export is named the same way whichever
// screen created it. Each grid row shows the reference it will be given, in its
// own frozen column.
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
  weight: number | null;
  used_weight_total: number;
  remaining_weight: number | null;
  // The licence's own masters. Shown read-only in the header and copied onto
  // every export in the batch, so a consignment can never describe goods its
  // licence does not cover.
  buyer: string | null;
  kind_id: number | null;
  kind_name: string | null;
  type_of_goods_id: number | null;
  type_of_goods_name: string | null;
  transport_mode_id: number | null;
  transport_mode_name: string | null;
  currency_id: number | null;
  currency_name: string | null;
}

/**
 * The five charge amounts, as the server computes them.
 *
 * Deliberately NOT recalculated here. They come from rules in
 * tax_rule_master_t (§4.2), evaluated by the same function that writes them at
 * insert — so what the grid shows and what the record gets cannot disagree. The
 * legacy screen kept the arithmetic in PHP and again in JavaScript, which is
 * exactly the drift this avoids (§4.10).
 */
interface ChargeAmounts {
  ceec_amount: string | null;
  cgea_amount: string | null;
  occ_amount: string | null;
  lmc_amount: string | null;
  ogefrem_amount: string | null;
}

const CHARGE_COLUMNS: Array<{ key: keyof ChargeAmounts; label: string }> = [
  { key: 'ceec_amount', label: 'CEEC Amount' },
  { key: 'cgea_amount', label: 'CGEA Amount' },
  { key: 'occ_amount', label: 'OCC Amount' },
  { key: 'lmc_amount', label: 'LMC Amount' },
  { key: 'ogefrem_amount', label: 'OGEFREM Amount' },
];

const CHARGE_KEYS = new Set<string>(CHARGE_COLUMNS.map((c) => c.key));

// Every cell is held as a string — an <input> has no other state, and coercing
// once at submit keeps a half-typed number from becoming NaN mid-edit.
interface GridRow {
  /**
   * Stable identity for the row, independent of its position.
   *
   * The index cannot serve: removing a row shifts every one below it, which
   * would move React's keys AND move which cells are marked as hand-edited onto
   * the wrong consignment.
   */
  _key: number;
  loading_date: string;
  bp_date: string;
  site_of_loading_id: string;
  destination: string;
  horse: string;
  trailer_1: string;
  trailer_2: string;
  feet_container_id: string;
  wagon_ref: string;
  container: string;
  transporter: string;
  exit_point_id: string;
  weight: string;
  fob: string;
  number_of_bags: string;
  lot_number: string;
  dgda_seal_no: string;
  // The five charge amounts. Auto-filled from the configured rules, and
  // editable — a tariff is a default, not a fact, and an operator sometimes has
  // a figure the rules cannot know about.
  ceec_amount: string;
  cgea_amount: string;
  occ_amount: string;
  lmc_amount: string;
  ogefrem_amount: string;
}

let nextRowKey = 1;

function newRow(): GridRow {
  return {
    _key: nextRowKey++,
    loading_date: '',
    bp_date: '',
    site_of_loading_id: '',
    destination: '',
    horse: '',
    trailer_1: '',
    trailer_2: '',
    feet_container_id: '',
    wagon_ref: '',
    container: '',
    transporter: '',
    exit_point_id: '',
    weight: '',
    fob: '',
    number_of_bags: '',
    lot_number: '',
    dgda_seal_no: '',
    ceec_amount: '',
    cgea_amount: '',
    occ_amount: '',
    lmc_amount: '',
    ogefrem_amount: '',
  };
}

/**
 * Transport modes, by the ids the tracking tables use.
 *
 * Road carries a truck (horse + trailers); rail and air carry a wagon reference
 * or an airway bill. The grid shows only the columns the mode actually uses —
 * offering both sets is how the wrong one gets filled in.
 */
const TRANSPORT_ROAD = 1;
const TRANSPORT_AIR = 2;
const TRANSPORT_RAIL = 3;

/** Enough for a day's loading; past this the grid stops being usable anyway. */
const MAX_ENTRIES = 200;

/**
 * Has the operator entered anything into this row?
 *
 * The charge amounts do not count: they arrive auto-filled, so counting them
 * would make every row look occupied and turn shrinking the entry count into a
 * confirmation prompt every time. `_key` is identity, not data.
 */
const rowHasData = (r: GridRow): boolean =>
  Object.entries(r).some(
    ([k, v]) =>
      k !== '_key' &&
      !CHARGE_KEYS.has(k) &&
      String(v ?? '').trim() !== '',
  );

const nonEmpty = (s: string): string | null =>
  s.trim() === '' ? null : s.trim();
const nonEmptyNum = (s: string): number | undefined =>
  s.trim() === '' ? undefined : Number(s);

function fmtMoney(n: number | null): string {
  if (n == null) return '∞';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2 });
}

/**
 * A header cell the licence fills in.
 *
 * Rendered as a disabled input rather than as text so it lines up with the real
 * controls beside it and reads as "a field that is not yours to type in" — the
 * placeholder says where the value comes from before a licence is chosen.
 */
function FromLicense({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null | undefined;
  tone?: 'over';
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className={`input bg-muted/60 ${tone === 'over' ? 'border-destructive text-red-700 dark:text-red-300' : ''}`}
        readOnly
        tabIndex={-1}
        value={value ?? ''}
        placeholder="From License"
        aria-label={label}
      />
    </div>
  );
}

export default function BulkNewExportsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Option[]>([]);
  const [licenses, setLicenses] = useState<Array<Option & { clientId: string }>>([]);
  const [clientId, setClientId] = useState<string>('');
  const [licenseId, setLicenseId] = useState<string>('');
  const [usage, setUsage] = useState<LicenseUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const [rows, setRows] = useState<GridRow[]>([newRow()]);
  // Held as a string so the field can be empty mid-typing; the grid only
  // changes when the value is committed (blur or Enter).
  const [entryCount, setEntryCount] = useState('1');
  const [previewRefs, setPreviewRefs] = useState<string[]>([]);
  // The five charge amounts per row, computed server-side from tax_rule_master_t.
  const [charges, setCharges] = useState<ChargeAmounts[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Batch-wide fields the operator owns. The rest of the header is the licence's.
  const [bpNo, setBpNo] = useState('');
  const [regimeId, setRegimeId] = useState('');
  const [clearanceId, setClearanceId] = useState('');
  const [regimes, setRegimes] = useState<Option[]>([]);
  const [clearances, setClearances] = useState<Option[]>([]);
  // Transit points are scoped by capability, so the Site of Loading picker
  // cannot offer an exit-only point and vice versa.
  const [loadingSites, setLoadingSites] = useState<Option[]>([]);
  const [exitPoints, setExitPoints] = useState<Option[]>([]);
  const [feetContainers, setFeetContainers] = useState<Option[]>([]);

  // The header is step one. The grid appears once it is complete, so an operator
  // is told what is missing before they fill in twenty rows rather than after.
  const [proceeded, setProceeded] = useState(false);

  // Which truck/wagon columns the grid shows, and what to call the wagon one.
  const transportModeId = usage?.transport_mode_id ?? null;
  const isRoad = transportModeId === null || transportModeId === TRANSPORT_ROAD;
  const isWagon = transportModeId === TRANSPORT_AIR || transportModeId === TRANSPORT_RAIL;
  const wagonLabel = transportModeId === TRANSPORT_AIR ? 'Airway Bill' : 'Wagon Reference';

  /** The licence's number, shown read-only on every grid row. */
  const licenseLabel = useMemo(
    () => licenses.find((l) => l.value === licenseId)?.label ?? '',
    [licenses, licenseId],
  );

  /** One box, a batch of N — show the range that will be taken, not just the first. */
  const mcaRefSummary = useMemo(() => {
    if (previewRefs.length === 0) return '';
    if (previewRefs.length === 1) return previewRefs[0];
    return `${previewRefs[0]} … ${previewRefs[previewRefs.length - 1]}`;
  }, [previewRefs]);

  // Load pickers on mount. Both are small (<2k rows each) so a
  // single unpaginated fetch is fine.
  useEffect(() => {
    (async () => {
      const [clientOpts, lRes, regimeOpts, clearanceOpts, siteOpts, exitOpts, feetOpts] =
        await Promise.all([
          // Clients are labelled by short code, via the shared helper (§4.15).
          // licenses allows pageSize up to 500.
          fetchClientOptions(),
          fetch('/api/v1/licenses?pageSize=500').then((r) => r.json()),
          // Export regimes only — the same filter the single-record form applies.
          fetchMasterOptions('regimes?type=E', 'regime_name'),
          fetchMasterOptions('clearances', 'clearance_name'),
          fetchMasterOptions('transit-points?capability=loading', 'transit_point_name'),
          fetchMasterOptions('transit-points?capability=exit_point', 'transit_point_name'),
          fetchMasterOptions('feet-containers', 'feet_container_size'),
        ]);
      setClients(clientOpts);
      // fetchMasterOptions returns { id, label }; the picker takes { value, label }.
      const asOptions = (rows: MasterOption[]): Option[] =>
        rows.map((o) => ({ value: String(o.id), label: o.label }));
      setRegimes(asOptions(regimeOpts));
      setClearances(asOptions(clearanceOpts));
      setLoadingSites(asOptions(siteOpts));
      setExitPoints(asOptions(exitOpts));
      setFeetContainers(asOptions(feetOpts));
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
    const params = new URLSearchParams({
      target: 'export',
      client_id: clientId,
      license_id: licenseId,
      count: String(Math.min(rows.length, MAX_ENTRIES)),
    });
    (async () => {
      const res = await safeFetchJson<{ refs: string[] }>(`/api/v1/mca-ref-formats/preview?${params}`);
      if (cancelled) return;
      setPreviewRefs(res.ok ? res.data.refs : []);
    })();
    return () => { cancelled = true; };
  }, [clientId, licenseId, rows.length]);

  // §4.2 — the charge amounts, recomputed by the server whenever an input they
  // depend on changes. Debounced: the operator types a weight digit by digit,
  // and a round trip per keystroke would be both wasteful and visibly jumpy.
  //
  // Only the ROW INPUTS the rules read go into this key, so writing the results
  // back does not retrigger the fetch.
  const chargeInputs = useMemo(
    () =>
      JSON.stringify({
        type_of_goods_id: usage?.type_of_goods_id ?? null,
        rows: rows.map((r) => ({
          _key: r._key,
          weight: r.weight === '' ? 0 : Number(r.weight),
          fob: r.fob === '' ? 0 : Number(r.fob),
          feet_container_id: r.feet_container_id === '' ? null : Number(r.feet_container_id),
        })),
      }),
    [rows, usage],
  );

  /**
   * Cells the operator has typed into, as `<row key>:<column>`.
   *
   * A recompute must not undo a hand-entered amount — the operator overrode the
   * tariff on purpose, and having it silently revert the next time they adjust a
   * weight would be worse than not auto-filling at all.
   *
   * State, because the grid tints an overridden cell and that has to re-render.
   * The recompute effect reads it through a mirror ref instead of taking it as a
   * dependency: depending on it would restart the debounce and fire another
   * request the first time each cell is touched.
   */
  const [overriddenAmounts, setOverriddenAmounts] = useState<Set<string>>(new Set());
  const overriddenRef = useRef(overriddenAmounts);
  useEffect(() => {
    overriddenRef.current = overriddenAmounts;
  }, [overriddenAmounts]);

  const markOverridden = useCallback((key: string) => {
    setOverriddenAmounts((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  useEffect(() => {
    if (!proceeded) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const parsed = JSON.parse(chargeInputs) as {
          rows: Array<{ _key: number }>;
        };
        const res = await safeFetchJson<{ rows: ChargeAmounts[] }>(
          '/api/v1/exports/charge-preview',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: chargeInputs },
        );
        if (cancelled || !res.ok) return;

        // Matched back by row key, not by position: a row removed while the
        // request was in flight would otherwise land its charges on its neighbour.
        const byKey = new Map<number, ChargeAmounts>();
        parsed.rows.forEach((r, i) => {
          const amounts = res.data.rows[i];
          if (amounts) byKey.set(r._key, amounts);
        });

        setRows((prev) =>
          prev.map((row) => {
            const amounts = byKey.get(row._key);
            if (!amounts) return row;
            let next = row;
            for (const col of CHARGE_COLUMNS) {
              if (overriddenRef.current.has(`${row._key}:${col.key}`)) continue;
              const value = amounts[col.key] ?? '';
              if (next[col.key] === value) continue;
              next = { ...next, [col.key]: value };
            }
            return next;
          }),
        );
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [chargeInputs, proceeded]);

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

  // A licence caps both the value and the tonnage. Either overrun blocks the
  // save; the server re-checks and is authoritative, but an operator should not
  // have to submit to find out.
  const capExceeded = usage?.remaining_fob != null && batchFob > usage.remaining_fob;
  const weightExceeded =
    usage?.remaining_weight != null && batchWeight > usage.remaining_weight;

  /** One sentence per overrun, naming the ceiling and by how much (§4.23). */
  const capOverruns = useMemo(() => {
    const out: string[] = [];
    if (usage?.remaining_fob != null && batchFob > usage.remaining_fob) {
      out.push(
        `FOB is over by ${fmtMoney(batchFob - usage.remaining_fob)} — this batch totals ` +
          `${fmtMoney(batchFob)} and only ${fmtMoney(usage.remaining_fob)} is left on the licence.`,
      );
    }
    if (usage?.remaining_weight != null && batchWeight > usage.remaining_weight) {
      out.push(
        `Weight is over by ${fmtMoney(batchWeight - usage.remaining_weight)} MT — this batch totals ` +
          `${fmtMoney(batchWeight)} MT and only ${fmtMoney(usage.remaining_weight)} MT is left on the licence.`,
      );
    }
    return out;
  }, [usage, batchFob, batchWeight]);

  function updateRow(idx: number, patch: Partial<GridRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  /** Validate the header, then reveal the grid. Names what is missing (§4.23). */
  function proceed() {
    const missing: string[] = [];
    if (!clientId) missing.push('Client');
    if (!licenseId) missing.push('License Number');
    if (!regimeId) missing.push('Regime');
    if (!clearanceId) missing.push('Types of Clearance');
    if (missing.length > 0) {
      setError(
        `Fill in ${missing.join(', ')} before entering the export rows — ${missing.length === 1 ? 'it applies' : 'they apply'} to every entry in the batch.`,
      );
      return;
    }
    if (previewRefs.length === 0) {
      setError(
        'The MCA reference cannot be built for this licence, so the exports would have no reference. Complete the licence first.',
      );
      return;
    }
    setError(null);
    setProceeded(true);
  }

  // Add/remove keep the count field in step, so the header never disagrees with
  // the grid. Computed from `rows` rather than inside the updater — a state
  // updater has to stay a pure calculation.
  function addRow() {
    const next = [...rows, newRow()];
    setRows(next);
    setEntryCount(String(next.length));
  }
  function removeRow(idx: number) {
    const next = rows.length === 1 ? [newRow()] : rows.filter((_, i) => i !== idx);
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
      setRows((prev) => [...prev, ...Array.from({ length: target - prev.length }, () => (newRow()))]);
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
    // Belt as well as braces: the button is already disabled, but a keyboard
    // submit or a stale render must not get past the ceilings either. The server
    // checks again and is the authority — this only saves a round trip.
    if (capOverruns.length > 0) {
      setError(
        `Nothing was saved — the batch exceeds what the licence has left. ${capOverruns.join(' ')}`,
      );
      return;
    }

    const body = {
      common: {
        client_id: Number(clientId),
        license_id: Number(licenseId),
        bp_no: bpNo.trim() || undefined,
        regime_id: regimeId ? Number(regimeId) : undefined,
        types_of_clearance_id: clearanceId ? Number(clearanceId) : undefined,
        // Carried from the licence so a new export arrives complete. These used
        // to be left null, which is why every record opened with Kind, Type of
        // Goods, Transport Mode and Currency blank and had to be corrected.
        kind_id: usage?.kind_id ?? undefined,
        type_of_goods_id: usage?.type_of_goods_id ?? undefined,
        transport_mode_id: usage?.transport_mode_id ?? undefined,
        currency_id: usage?.currency_id ?? undefined,
        buyer: usage?.buyer ?? undefined,
      },
      rows: rows.map((r) => ({
        loading_date: nonEmpty(r.loading_date),
        bp_date: nonEmpty(r.bp_date),
        site_of_loading_id: nonEmptyNum(r.site_of_loading_id) ?? null,
        destination: nonEmpty(r.destination),
        // Only the columns the chosen transport mode uses are sent — the others
        // are not on screen, so submitting whatever they held would write a
        // trailer number onto a consignment that travels by rail.
        horse: isRoad ? nonEmpty(r.horse) : null,
        trailer_1: isRoad ? nonEmpty(r.trailer_1) : null,
        trailer_2: isRoad ? nonEmpty(r.trailer_2) : null,
        wagon_ref: isWagon ? nonEmpty(r.wagon_ref) : null,
        feet_container_id: nonEmptyNum(r.feet_container_id) ?? null,
        container: nonEmpty(r.container),
        transporter: nonEmpty(r.transporter),
        exit_point_id: nonEmptyNum(r.exit_point_id) ?? null,
        weight: nonEmptyNum(r.weight),
        fob: nonEmptyNum(r.fob),
        number_of_bags:
          r.number_of_bags.trim() === '' ? null : Number(r.number_of_bags),
        lot_number: nonEmpty(r.lot_number),
        dgda_seal_no: nonEmpty(r.dgda_seal_no),
        number_of_seals: sealCount(r.dgda_seal_no) || null,
        // Sent as shown. The server still computes the configured rate for any
        // amount left blank, so clearing a cell falls back to the tariff rather
        // than writing nothing.
        ceec_amount: nonEmptyNum(r.ceec_amount) ?? null,
        cgea_amount: nonEmptyNum(r.cgea_amount) ?? null,
        occ_amount: nonEmptyNum(r.occ_amount) ?? null,
        lmc_amount: nonEmptyNum(r.lmc_amount) ?? null,
        ogefrem_amount: nonEmptyNum(r.ogefrem_amount) ?? null,
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
        {/* The commit lives under the grid, not up here — the operator's last
            act is the bottom row, and a Create button above a long horizontal
            table is a scroll away from the work it applies to. Step one keeps a
            Cancel of its own; step two carries both beneath the table. */}
        {!proceeded && (
          <button
            className="btn-secondary"
            type="button"
            onClick={() => router.push('/exports')}
          >
            <X className="h-4 w-4" /> Cancel
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Documentation ────────────────────────────────────────────────
          The batch header: what every export in it shares. Four of these are
          the operator's to choose (client, licence, how many, regime / types of
          clearance); the rest are READ-ONLY, copied from the licence, because
          the licence is the authority on them and re-typing them per batch is
          how they drift apart. */}
      <div className="card mb-4 overflow-hidden">
        <div className="bg-brand-gradient flex items-center gap-2 px-4 py-2.5 text-white">
          <FileText className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Documentation</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="label required">Client</label>
            <SearchableSelect
              required
              value={clientId}
              onChange={(v) => { setClientId(v); setLicenseId(''); }}
              options={clients}
              placeholder="-- Select --"
              emptyLabel="—"
              aria-label="Client"
            />
          </div>

          <div>
            <label className="label" htmlFor="bp_no">BP Number</label>
            <input
              id="bp_no"
              className="input"
              value={bpNo}
              onChange={(e) => setBpNo(e.target.value)}
              maxLength={100}
              placeholder="e.g. 1234-56"
            />
          </div>

          <div>
            <label className="label required" htmlFor="entry_count">Number of Entries</label>
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
          </div>

          <div>
            <label className="label required">License Number</label>
            <SearchableSelect
              required
              value={licenseId}
              onChange={setLicenseId}
              options={clientId ? licenses.filter((l) => l.clientId === clientId) : licenses}
              placeholder={clientId ? '-- Select --' : 'Select client first'}
              emptyLabel="—"
              aria-label="License number"
            />
          </div>

          {/* Row 2 — the licence's own masters. Read-only: an export inherits
              them, and letting a batch override them is how a consignment ends
              up describing goods its licence never covered. */}
          <FromLicense label="Kind" value={usage?.kind_name} />
          <FromLicense label="Type of Goods" value={usage?.type_of_goods_name} />
          <FromLicense label="Transport Mode" value={usage?.transport_mode_name} />

          <div>
            <label className="label required">MCA Ref</label>
            {/* §4.33 — issued by the configured format, never typed. One box for
                a batch of N, so it shows the range that will be taken. */}
            <input
              className="input bg-muted/60 font-mono"
              readOnly
              tabIndex={-1}
              value={mcaRefSummary}
              placeholder="Auto-generated"
              aria-label="MCA reference (auto-generated)"
            />
          </div>

          {/* Row 3 */}
          <FromLicense label="Currency" value={usage?.currency_name} />
          <FromLicense label="Buyer" value={usage?.buyer} />

          <div>
            <label className="label required">Regime</label>
            <SearchableSelect
              required
              value={regimeId}
              onChange={setRegimeId}
              options={regimes}
              placeholder="-- Select --"
              aria-label="Regime"
            />
          </div>

          <div>
            <label className="label required">Types of Clearance</label>
            <SearchableSelect
              required
              value={clearanceId}
              onChange={setClearanceId}
              options={clearances}
              placeholder="-- Select --"
              aria-label="Types of clearance"
            />
          </div>

          {/* Row 4 — the two ceilings and what is left of them, so the operator
              can size the batch before entering a single row. */}
          <FromLicense label="License Weight (MT)" value={usage ? fmtMoney(usage.weight) : null} />
          <FromLicense label="License FOB" value={usage ? fmtMoney(usage.amount) : null} />
          <FromLicense
            label="Remaining Weight (MT)"
            value={usage ? fmtMoney(usage.remaining_weight) : null}
            tone={weightExceeded ? 'over' : undefined}
          />
          <FromLicense
            label="Remaining FOB"
            value={usage ? fmtMoney(usage.remaining_fob) : null}
            tone={capExceeded ? 'over' : undefined}
          />
        </div>

        {/* One step to the next: the header is complete, now enter the rows.
            Also the point at which the header is validated, so an operator is
            told what is missing before they fill in twenty rows. */}
        {!proceeded && (
          <div className="border-t border-border p-4">
            <button
              type="button"
              onClick={proceed}
              className="btn-primary w-full justify-center py-2.5 text-base"
            >
              Proceed to Create Exports <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Over one of the licence's ceilings — said plainly, above the numbers
            it refers to, rather than left to be inferred from a red figure and a
            disabled button. Nothing is saved while this is showing, and the
            server refuses the same batch independently. */}
        {capOverruns.length > 0 && (
          <div
            role="alert"
            className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-500/30 dark:bg-red-500/10"
          >
            <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              This batch exceeds what the licence has left — nothing will be saved.
            </div>
            <ul className="mt-1.5 space-y-0.5 ps-6 text-xs text-red-700 dark:text-red-300">
              {capOverruns.map((line) => (
                <li key={line} className="list-disc">{line}</li>
              ))}
            </ul>
            <p className="mt-1.5 ps-6 text-xs text-muted-foreground">
              Reduce the weights or FOB values below, or remove entries, until both figures fit.
            </p>
          </div>
        )}

        {/* The licence's ceilings and what this batch leaves of them. Centred and
            set apart in the informational hue, because it is the number an
            operator checks before typing rather than a field they fill in. */}
        {usage && (
          <div className="mx-4 mb-4 rounded-lg border border-cyan-300 bg-cyan-50 p-3 text-center text-sm dark:border-cyan-500/30 dark:bg-cyan-500/10">
            {usageLoading ? (
              <span className="text-muted-foreground">Loading license usage…</span>
            ) : (
              <div className="space-y-1">
                <div className="text-foreground">
                  <strong>License Weight:</strong>{' '}
                  <span className="font-mono">{fmtMoney(usage.weight)}</span> MT
                  <span className="mx-2 text-muted-foreground">|</span>
                  <strong>License FOB:</strong>{' '}
                  <span className="font-mono">{fmtMoney(usage.amount)}</span>
                </div>
                <div className="text-foreground">
                  <strong>Used Weight:</strong>{' '}
                  <span className="font-mono">{fmtMoney(usage.used_weight_total)}</span> MT
                  <span className="mx-2 text-muted-foreground">|</span>
                  <strong>Used FOB:</strong>{' '}
                  <span className="font-mono">{fmtMoney(usage.used_fob_total)}</span>
                </div>
                <div className="text-foreground">
                  <strong>Remaining:</strong>{' '}
                  {/* Red the moment the batch would overrun the licence — the
                      figure the operator is watching says so itself. */}
                  <span
                    className={`font-mono font-semibold ${
                      weightExceeded
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {fmtMoney(
                      usage.remaining_weight == null
                        ? null
                        : usage.remaining_weight - batchWeight,
                    )}
                  </span>{' '}
                  MT
                  <span className="mx-2 text-muted-foreground">|</span>
                  <span
                    className={`font-mono font-semibold ${
                      capExceeded ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {fmtMoney(
                      usage.remaining_fob == null ? null : usage.remaining_fob - batchFob,
                    )}
                  </span>{' '}
                  FOB
                </div>
                <div className="flex items-center justify-center gap-1.5 pt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  At least one entry must have weight &gt; 0 to create exports.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step two — the entries grid. Hidden until the header is complete, so
          the batch-wide decisions are settled before any row is typed.

          `#` and MCA Ref are FROZEN to the left; everything else scrolls under
          them. A row is identified by its reference, so scrolling right to reach
          the FOB column and losing sight of which consignment you are typing
          into is how the wrong row gets filled in. The two frozen cells carry
          their own background — a transparent sticky cell shows the scrolling
          content sliding underneath it. */}
      {proceeded && (
      <div className="card overflow-hidden">
        {/* The grid's own title bar, in the brand gradient the header and footer
            already use — so the work surface is bracketed the same way the app is. */}
        <div className="bg-brand-gradient flex items-center gap-2 px-4 py-2.5 text-white">
          <FileText className="h-4 w-4" />
          <h2 className="text-sm font-semibold">
            New Exports — {rows.length} {rows.length === 1 ? 'Entry' : 'Entries'}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="table-entry w-max min-w-full whitespace-nowrap text-xs">
            <thead>
              <tr>
                {/* The two frozen header cells sit above the frozen body cells and
                    need the same opaque ground, which `.table-entry th` gives them. */}
                <th className="sticky left-0 z-20 w-12 px-1 text-center">#</th>
                <th className="sticky left-12 z-20 min-w-[11rem]">MCA Ref</th>
                <th className="min-w-[9rem]">License</th>
                <th className="min-w-[9rem]">Loading Date</th>
                <th className="min-w-[9rem]">BP Receive Date</th>
                <th className="min-w-[10rem]">Site of Loading</th>
                <th className="min-w-[9rem]">Destination</th>
                {isRoad && (
                  <>
                    <th className="min-w-[7rem]">Horse</th>
                    <th className="min-w-[7rem]">Trailer 1</th>
                    <th className="min-w-[7rem]">Trailer 2</th>
                  </>
                )}
                <th className="min-w-[9rem]">Feet Container</th>
                {isWagon && <th className="min-w-[9rem]">{wagonLabel}</th>}
                <th className="min-w-[8rem]">Container</th>
                <th className="min-w-[9rem]">Transporter</th>
                <th className="min-w-[10rem]">Exit Point</th>
                <th className="min-w-[7rem] text-right">Weight (MT)</th>
                <th className="min-w-[7rem] text-right">FOB</th>
                <th className="min-w-[6rem] text-right">No. of Bags</th>
                <th className="min-w-[8rem]">Lot Number</th>
                <th className="min-w-[13rem]">Seal DGDA</th>
                <th className="min-w-[6rem] text-right">No. of Seals</th>
                {CHARGE_COLUMNS.map((c) => (
                  <th key={c.key} className="min-w-[8rem] text-right">{c.label}</th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r._key}>
                  <td className="is-frozen sticky left-0 z-10 w-12 bg-card px-1 text-center font-semibold text-muted-foreground tabular-nums">
                    {i + 1}
                  </td>
                  {/* The reference this row will be given. Read-only — it comes
                      from the configured format (§4.33), not from the operator.
                      The heavier right rule marks where the frozen pair ends and
                      the scrolling columns begin. */}
                  <td className="is-ref sticky left-12 z-10 border-e-2 border-e-brand font-mono font-semibold">
                    {previewRefs[i] ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-muted-foreground">{licenseLabel || '—'}</td>
                  <td>
                    <input
                      type="date"
                      className="input px-2 py-1 text-xs"
                      value={r.loading_date}
                      onChange={(e) => updateRow(i, { loading_date: e.target.value })}
                      aria-label={`Loading date, row ${i + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="input px-2 py-1 text-xs"
                      value={r.bp_date}
                      onChange={(e) => updateRow(i, { bp_date: e.target.value })}
                      aria-label={`BP receive date, row ${i + 1}`}
                    />
                  </td>
                  <td>
                    <SearchableSelect
                      size="sm"
                      value={r.site_of_loading_id}
                      onChange={(v) => updateRow(i, { site_of_loading_id: v })}
                      options={loadingSites}
                      placeholder="—"
                      emptyLabel="—"
                      aria-label={`Site of loading, row ${i + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      className="input px-2 py-1 text-xs"
                      value={r.destination}
                      onChange={(e) => updateRow(i, { destination: e.target.value })}
                      maxLength={255}
                      aria-label={`Destination, row ${i + 1}`}
                    />
                  </td>

                  {/* Road carries a truck; rail and air carry a wagon or airway
                      bill. Showing both sets at once is how the wrong one gets
                      filled in, so the grid offers only the columns that apply. */}
                  {isRoad && (
                    <>
                      <td>
                        <input
                          className="input px-2 py-1 text-xs"
                          value={r.horse}
                          onChange={(e) => updateRow(i, { horse: e.target.value })}
                          maxLength={50}
                          aria-label={`Horse, row ${i + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          className="input px-2 py-1 text-xs"
                          value={r.trailer_1}
                          onChange={(e) => updateRow(i, { trailer_1: e.target.value })}
                          maxLength={50}
                          aria-label={`Trailer 1, row ${i + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          className="input px-2 py-1 text-xs"
                          value={r.trailer_2}
                          onChange={(e) => updateRow(i, { trailer_2: e.target.value })}
                          maxLength={50}
                          aria-label={`Trailer 2, row ${i + 1}`}
                        />
                      </td>
                    </>
                  )}

                  <td>
                    <SearchableSelect
                      size="sm"
                      value={r.feet_container_id}
                      onChange={(v) => updateRow(i, { feet_container_id: v })}
                      options={feetContainers}
                      placeholder="—"
                      emptyLabel="—"
                      aria-label={`Feet container, row ${i + 1}`}
                    />
                  </td>

                  {isWagon && (
                    <td>
                      <input
                        className="input px-2 py-1 text-xs"
                        value={r.wagon_ref}
                        onChange={(e) => updateRow(i, { wagon_ref: e.target.value })}
                        maxLength={50}
                        aria-label={`${wagonLabel}, row ${i + 1}`}
                      />
                    </td>
                  )}

                  <td>
                    <input
                      className="input px-2 py-1 text-xs"
                      value={r.container}
                      onChange={(e) => updateRow(i, { container: e.target.value })}
                      maxLength={50}
                      aria-label={`Container, row ${i + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      className="input px-2 py-1 text-xs"
                      value={r.transporter}
                      onChange={(e) => updateRow(i, { transporter: e.target.value })}
                      maxLength={255}
                      aria-label={`Transporter, row ${i + 1}`}
                    />
                  </td>
                  <td>
                    <SearchableSelect
                      size="sm"
                      value={r.exit_point_id}
                      onChange={(v) => updateRow(i, { exit_point_id: v })}
                      options={exitPoints}
                      placeholder="—"
                      emptyLabel="—"
                      aria-label={`Exit point, row ${i + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      className="input px-2 py-1 text-right text-xs"
                      value={r.weight}
                      onChange={(e) => updateRow(i, { weight: e.target.value })}
                      aria-label={`Weight, row ${i + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      className="input px-2 py-1 text-right text-xs"
                      value={r.fob}
                      onChange={(e) => updateRow(i, { fob: e.target.value })}
                      aria-label={`FOB, row ${i + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="input px-2 py-1 text-right text-xs"
                      value={r.number_of_bags}
                      onChange={(e) => updateRow(i, { number_of_bags: e.target.value })}
                      aria-label={`Number of bags, row ${i + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      className="input px-2 py-1 text-xs"
                      value={r.lot_number}
                      onChange={(e) => updateRow(i, { lot_number: e.target.value })}
                      maxLength={100}
                      aria-label={`Lot number, row ${i + 1}`}
                    />
                  </td>
                  <td>
                    <SealPickerControl
                      compact
                      value={r.dgda_seal_no}
                      onChange={(v) => updateRow(i, { dgda_seal_no: v })}
                    />
                  </td>
                  {/* Counted from the seal numbers by the same rule the
                      single-record form applies (§4.10) — never typed. Rendered
                      as a read-only control rather than bare text so it lines up
                      with the inputs beside it and reads as a field. */}
                  <td>
                    <input
                      className="input bg-muted/60 px-2 py-1 text-right text-xs"
                      readOnly
                      tabIndex={-1}
                      value={sealCount(r.dgda_seal_no) || ''}
                      placeholder="0"
                      aria-label={`Number of seals, row ${i + 1}`}
                    />
                  </td>

                  {/* The charge amounts. Auto-filled from the configured rules
                      (§4.2) but EDITABLE — a tariff is a default, not a fact.
                      Once typed into, a cell is left alone by later recomputes;
                      the tinted background marks it as the operator's figure
                      rather than the rules'. */}
                  {CHARGE_COLUMNS.map((c) => {
                    const overridden = overriddenAmounts.has(`${r._key}:${c.key}`);
                    return (
                      <td key={c.key}>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className={`input px-2 py-1 text-right font-mono text-xs ${
                            overridden ? 'bg-amber-50 dark:bg-amber-500/10' : ''
                          }`}
                          value={r[c.key]}
                          onChange={(e) => {
                            markOverridden(`${r._key}:${c.key}`);
                            updateRow(i, { [c.key]: e.target.value });
                          }}
                          placeholder="Auto"
                          title={
                            overridden
                              ? 'Entered by hand — the configured rate will not overwrite it'
                              : 'Calculated from the configured rate; type to override'
                          }
                          aria-label={`${c.label}, row ${i + 1}`}
                        />
                      </td>
                    );
                  })}
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 p-3">
          {/* §4.26 — adding an entry is the `create` action, so it wears the
              colour and icon configured for it rather than a grey that reads as
              secondary. It is the one control an operator reaches for repeatedly
              while filling the grid in. */}
          <button type="button" onClick={addRow} className="btn-create btn-sm shadow-sm">
            <Plus className="h-4 w-4" /> Add Entry
          </button>

          {/* The two figures the licence is checked against. Each is its own
              bordered chip: laid out as bare inline text the label of the second
              ran straight into the value of the first — "0.00Total Weight". */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Total FOB</span>
              <span
                className={`font-mono text-sm font-semibold ${
                  capExceeded ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                }`}
              >
                {fmtMoney(batchFob)}
              </span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Weight</span>
              <span
                className={`font-mono text-sm font-semibold ${
                  weightExceeded ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                }`}
              >
                {batchWeight.toLocaleString()}
              </span>
              <span className="text-[11px] text-muted-foreground">MT</span>
            </span>
          </div>
        </div>

        {/* The commit bar, at the end of the table where the work finishes.
            §4.21 — a labelled way out sits beside it, in every state. */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-3">
          {capOverruns.length > 0 && (
            <span className="me-auto text-xs font-medium text-red-700 dark:text-red-300">
              Over the licence — nothing can be saved until the totals fit.
            </span>
          )}
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
            disabled={saving || capOverruns.length > 0}
            title={capOverruns.length > 0 ? capOverruns.join(' ') : undefined}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Create {rows.length} Export{rows.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
      )}
    </>
  );
}
