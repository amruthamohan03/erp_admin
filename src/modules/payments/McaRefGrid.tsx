'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import type { McaLine } from '@/db/schema';

// §2 step 6 — the payment request's MCA reference lines. A request can be split
// across up to 50 tracking references, each carrying its own amount, and the
// header Amount is the sum of them (a `sumJson` derive on the amount field, so
// the two cannot drift).
//
// Two checks run against every reference, batched into ONE request for the whole
// grid rather than two per row: it must exist in the tracking table for the
// selected client and category, and it must not already be consumed by another
// request with the same expense type. The server re-runs both on save
// (assertPaymentMcaRefs) — this is the fast feedback, not the authority.

const MAX_REFS = 50;
const VALIDATE_DEBOUNCE_MS = 400;

interface Verdict {
  mca_ref: string;
  exists: boolean;
  duplicate: number | null;
  valid: boolean;
}

interface McaRefGridProps {
  value: McaLine[];
  onChange: (lines: McaLine[]) => void;
  readonly: boolean;
  clientId: number | null;
  payFor: number | null;
  expenseType: number | null;
  /** The request being edited, excluded from the duplicate check; null when creating. */
  paymentId: number | null;
  /** Location — its name seeds the OTH-/PRE- prefix for auto-generated references. */
  locationId: number | null;
  invalid?: boolean;
}

/**
 * Other (3) and Pre Payment (4) have no tracking table, so their references are
 * generated from the location rather than picked: OTH-<2 letters>-<n>.
 */
function isAutoRefCategory(payFor: number | null): boolean {
  return payFor === 3 || payFor === 4;
}

function autoRef(payFor: number | null, locationName: string | null, seq: number): string {
  const prefix = payFor === 4 ? 'PRE' : 'OTH';
  const loc = (locationName ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'XX';
  return `${prefix}-${loc}-${seq}`;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export default function McaRefGrid({
  value,
  onChange,
  readonly,
  clientId,
  payFor,
  expenseType,
  paymentId,
  locationId,
  invalid,
}: McaRefGridProps) {
  const lines = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const [options, setOptions] = useState<string[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [checking, setChecking] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);
  const auto = isAutoRefCategory(payFor);

  // Only Other / Pre Payment build a reference out of the location, so the
  // lookup is skipped entirely for the tracking categories.
  useEffect(() => {
    if (!auto || !locationId) return;
    let cancelled = false;
    fetch(`/api/v1/main-offices/${locationId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.ok) setLocationName(j.data?.main_location_name ?? null);
      })
      .catch(() => {
        // Falls back to the XX placeholder in autoRef().
      });
    return () => {
      cancelled = true;
    };
  }, [auto, locationId]);

  // Reference picker — the client's own tracking references for this category.
  // Empty for Other / Pre Payment, which generate their references instead.
  useEffect(() => {
    if (auto || !clientId || payFor === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptions([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/v1/payments/mca-options?client_id=${clientId}&pay_for=${payFor}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.ok || !Array.isArray(j.data)) return;
        setOptions(j.data.map((r: { mca_ref: string }) => r.mca_ref).filter(Boolean));
      })
      .catch(() => {
        // Leave the picker empty; references can still be typed.
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, payFor, auto]);

  // Batch-validate the whole grid in ONE request, debounced so typing a reference
  // does not fire a request per keystroke. Re-runs when the grid changes and when
  // the inputs the verdicts depend on do — a reference valid for one client or
  // expense type is not necessarily valid for another.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const refs = lines.map((l) => l.mca_ref.trim()).filter(Boolean);
    if (refs.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVerdicts({});
      setChecking(false);
      abortRef.current?.abort();
      return;
    }
    // Synchronising with an external system (the validation endpoint), so the
    // pending flag has to be raised here rather than in a render.
    setChecking(true);

    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetch('/api/v1/payments/mca-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          refs,
          pay_for: payFor,
          client_id: clientId,
          expense_type: expenseType,
          payment_id: paymentId,
        }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (!j?.ok || !Array.isArray(j.data)) return;
          const next: Record<string, Verdict> = {};
          for (const v of j.data as Verdict[]) next[v.mca_ref.toUpperCase()] = v;
          setVerdicts(next);
        })
        .catch(() => {
          // Aborted or offline — leave the previous verdicts rather than
          // flashing every row to "invalid" on a dropped connection.
        })
        .finally(() => setChecking(false));
    }, VALIDATE_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [lines, payFor, clientId, expenseType, paymentId]);

  function commit(next: McaLine[]): void {
    onChange(next);
  }

  function addRow(ref = ''): void {
    if (lines.length >= MAX_REFS) return;
    const value = ref || (auto ? autoRef(payFor, locationName, lines.length + 1) : '');
    commit([...lines, { mca_ref: value, amount: 0 }]);
  }

  function updateRow(index: number, patch: Partial<McaLine>): void {
    commit(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeRow(index: number): void {
    commit(lines.filter((_, i) => i !== index));
  }

  const total = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const used = useMemo(
    () => new Set(lines.map((l) => l.mca_ref.trim().toUpperCase()).filter(Boolean)),
    [lines],
  );
  const pickerOptions = useMemo(
    () => options.filter((o) => !used.has(o.toUpperCase())).map((o) => ({ value: o, label: o })),
    [options, used],
  );

  // In-grid duplicates are caught here rather than server-side, so the second
  // occurrence is marked as the user types it.
  const duplicateRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lines) {
      const up = l.mca_ref.trim().toUpperCase();
      if (up) counts.set(up, (counts.get(up) ?? 0) + 1);
    }
    return counts;
  }, [lines]);

  function statusFor(line: McaLine, index: number): { icon: React.ReactNode; text: string; cls: string } | null {
    const ref = line.mca_ref.trim();
    if (!ref) return null;
    const up = ref.toUpperCase();
    if ((duplicateRows.get(up) ?? 0) > 1 && lines.findIndex((l) => l.mca_ref.trim().toUpperCase() === up) !== index) {
      return { icon: <AlertCircle className="h-3.5 w-3.5" />, text: 'Listed twice', cls: 'text-red-600 dark:text-red-400' };
    }
    const v = verdicts[up];
    if (!v) {
      return checking
        ? { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: 'Checking…', cls: 'text-muted-foreground' }
        : null;
    }
    if (v.valid) {
      return { icon: <CheckCircle2 className="h-3.5 w-3.5" />, text: 'OK', cls: 'text-emerald-600 dark:text-emerald-400' };
    }
    return {
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      text: !v.exists ? 'Not found for this client' : `Used by #${v.duplicate}`,
      cls: 'text-red-600 dark:text-red-400',
    };
  }

  const needsClient = !auto && !clientId;

  return (
    <div
      className={`rounded-md border ${invalid ? 'border-red-400 dark:border-red-500' : 'border-border'}`}
      aria-invalid={invalid || undefined}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 p-2">
        {!readonly && !auto && (
          <SearchableSelect
            className="min-w-[16rem] flex-1"
            size="sm"
            value=""
            onChange={(v) => v && addRow(v)}
            options={pickerOptions}
            aria-label="Add a tracking reference"
            placeholder={
              needsClient
                ? 'Select a client first'
                : pickerOptions.length === 0
                  ? 'No unused references for this client'
                  : 'Pick a reference to add…'
            }
            disabled={needsClient || pickerOptions.length === 0}
          />
        )}
        {!readonly && (
          <button
            type="button"
            onClick={() => addRow()}
            disabled={lines.length >= MAX_REFS}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            {auto ? 'Generate reference' : 'Add row'}
          </button>
        )}
        <span className="ms-auto text-xs text-muted-foreground">
          {lines.length} of {MAX_REFS}
        </span>
      </div>

      {lines.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">
          No references yet. {auto ? 'Generate one for this request.' : 'Pick one above, or add a row and type it.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base text-xs">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Reference</th>
                <th className="w-40 text-right">Amount</th>
                <th className="w-48">Status</th>
                {!readonly && <th className="w-12" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const status = statusFor(line, i);
                return (
                  <tr key={i}>
                    <td className="text-muted-foreground">{i + 1}</td>
                    <td>
                      <input
                        className="input font-mono text-xs"
                        value={line.mca_ref}
                        // Auto-generated references are derived from the location,
                        // not hand-entered — same as the legacy read-only input.
                        readOnly={readonly || auto}
                        disabled={readonly}
                        aria-label={`Reference ${i + 1}`}
                        onChange={(e) => updateRow(i, { mca_ref: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        className="input text-right text-xs tabular-nums"
                        value={String(line.amount ?? '')}
                        disabled={readonly}
                        aria-label={`Amount for reference ${i + 1}`}
                        onChange={(e) => updateRow(i, { amount: e.target.value === '' ? 0 : Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      {status && (
                        <span className={`inline-flex items-center gap-1 ${status.cls}`}>
                          {status.icon} {status.text}
                        </span>
                      )}
                    </td>
                    {!readonly && (
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          aria-label={`Remove reference ${i + 1}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td colSpan={2} className="text-right">Total</td>
                <td className="text-right tabular-nums">
                  {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td colSpan={readonly ? 1 : 2} className="text-xs font-normal text-muted-foreground">
                  drives the header Amount
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
