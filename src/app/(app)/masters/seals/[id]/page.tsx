'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  PackagePlus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate } from '@/lib/formatDate';

/**
 * An export file that still names a seal being released, as reported by
 * `POST /api/v1/seal-numbers/release` when it refuses (§4.23).
 */
interface SealHolder {
  export_id: number;
  mca_ref: string | null;
  seal_numbers: string[];
}

interface BatchDetail {
  id: number;
  office_location_id: number | null;
  location_name: string | null;
  sub_office_code: string | null;
  purchase_date: string | null;
  total_amount: string | null;
  total_seal: number;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

interface SealRow {
  id: number;
  seal_number: string;
  status: 'Available' | 'Used' | 'Damaged';
  notes: string | null;
  location: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const STATUS_STYLES: Record<SealRow['status'], string> = {
  Available: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  Used: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30',
  Damaged: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
};

export default function SealBatchDetailPage() {
  const params = useParams<{ id: string }>();
  const batchId = params?.id;

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [numbers, setNumbers] = useState<SealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [pasteText, setPasteText] = useState('');
  const [adding, setAdding] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [referenceInfo, setReferenceInfo] = useState('');

  // §4.22 — the outcome of a release/mark-used, acknowledged by the operator.
  const [result, setResult] = useState<SaveResult | null>(null);
  /**
   * Set when a release was refused because the seals are still on export files.
   * Holds what the server told us, so the confirmation can name the files and
   * the seals rather than asking "are you sure?" about nothing in particular.
   */
  const [detachAsk, setDetachAsk] = useState<{ seals: string[]; holders: SealHolder[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    setError(null);
    try {
      const [bRes, nRes] = await Promise.all([
        fetch(`/api/v1/seals/${batchId}`).then((r) => r.json()),
        fetch(`/api/v1/seals/${batchId}/numbers`).then((r) => r.json()),
      ]);
      if (bRes.ok) setBatch(bRes.data);
      else setError(bRes.error?.message ?? 'Failed to load batch');
      if (nRes.ok) setNumbers(nRes.data);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(on: boolean) {
    setSelected(on ? new Set(numbers.map((n) => n.id)) : new Set());
  }

  function selectedSealNumbers(): string[] {
    const lookup = new Map(numbers.map((n) => [n.id, n.seal_number]));
    return Array.from(selected)
      .map((id) => lookup.get(id))
      .filter((v): v is string => !!v);
  }

  async function addNumbers() {
    if (!batchId || !pasteText.trim()) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/seals/${batchId}/numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seal_numbers: pasteText }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Add failed');
        return;
      }
      setNotice(`Added ${json.data.added} of ${json.data.total} numbers.`);
      setPasteText('');
      await load();
    } catch {
      setError('Network error');
    } finally {
      setAdding(false);
    }
  }

  async function markUsed() {
    const nums = selectedSealNumbers();
    if (nums.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/v1/seal-numbers/mark-used', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seal_numbers: nums,
          reference_info: referenceInfo.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Mark-used failed');
        return;
      }
      setNotice(
        `Marked ${json.data.marked} used.${
          json.data.failed.length ? ` Skipped ${json.data.failed.length}.` : ''
        }`,
      );
      setSelected(new Set());
      setReferenceInfo('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Make the selected seals Available again.
   *
   * Two passes by design. The first asks without `detach`, and the server
   * REFUSES if any of these seals is still named by a live export — freeing one
   * there and then left the export claiming a seal the master had already handed
   * on, so the same physical seal could reach two consignments. The refusal
   * carries the files, we ask, and only then do we repeat with `detach: true`,
   * which takes the seals off those exports and releases them in one
   * transaction.
   */
  async function release(detach = false) {
    const nums = selectedSealNumbers();
    if (nums.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await safeFetchJson<{ released: number; failed: string[]; detached: number }>(
        '/api/v1/seal-numbers/release',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seal_numbers: nums, ...(detach ? { detach: true } : {}) }),
        },
      );

      if (!res.ok) {
        const details = res.details as { requires_confirmation?: string; holders?: SealHolder[] } | undefined;
        if (details?.requires_confirmation === 'detach' && details.holders?.length) {
          // Not an error the operator has to fix — a question. Ask it.
          setDetachAsk({ seals: nums, holders: details.holders });
          return;
        }
        setResult({ status: 'error', title: 'Not released', message: res.message });
        return;
      }

      setDetachAsk(null);
      setSelected(new Set());
      await load();

      const { released, detached, failed } = res.data;
      const parts = [`${released} seal${released === 1 ? '' : 's'} released`];
      if (detached > 0) {
        parts.push(
          `removed from ${detached} export file${detached === 1 ? '' : 's'}, whose No. of Seals was recalculated`,
        );
      }
      if (failed.length > 0) {
        // Not an error: a Damaged or already-Available seal simply has nothing
        // to release. Say which, so the count adding up is not a mystery.
        parts.push(`${failed.length} skipped (not currently in use): ${failed.join(', ')}`);
      }
      setResult({ status: 'success', title: 'Released', message: `${parts.join('. ')}.` });
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Soft-delete ${selected.size} seal number(s)?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // No bulk-delete endpoint — fire individually. Each one is its
      // own transaction with its own audit row.
      const ids = Array.from(selected);
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/v1/seal-numbers/${id}`, { method: 'DELETE' }).then((r) =>
            r.json(),
          ),
        ),
      );
      const failed = results.filter((r) => !r.ok).length;
      setNotice(
        `Deleted ${ids.length - failed}.${failed ? ` ${failed} failed.` : ''}`,
      );
      setSelected(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  }

  const allChecked = numbers.length > 0 && selected.size === numbers.length;
  const someChecked = selected.size > 0 && !allChecked;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/masters/seals"
            className="text-sm text-muted-foreground hover:underline flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to batches
          </Link>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary-600" />
            Seal Batch #{batchId}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="btn-secondary"
            title="Reload"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {batchId && (
            <a
              href={`/api/v1/seals/${batchId}/export`}
              target="_blank"
              rel="noopener"
              className="btn-secondary"
            >
              <Download className="h-4 w-4" /> Export
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: batch metadata + add-numbers panel */}
        <div className="space-y-6">
          {batch && (
            <div className="card p-6 space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Batch details
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Office</dt>
                <dd className="text-foreground">{batch.location_name ?? '—'}</dd>
                <dt className="text-muted-foreground">Sub-office</dt>
                <dd className="text-foreground">
                  {batch.sub_office_code ?? '—'}
                </dd>
                <dt className="text-muted-foreground">Purchase date</dt>
                {/* §4.19 — was printing the stored ISO. */}
                <dd className="text-foreground">{formatDate(batch.purchase_date)}</dd>
                <dt className="text-muted-foreground">Total amount</dt>
                <dd className="text-foreground font-mono">
                  {batch.total_amount ?? '0'}
                </dd>
                <dt className="text-muted-foreground">Budget (seals)</dt>
                <dd className="text-foreground">{batch.total_seal}</dd>
                <dt className="text-muted-foreground">Added so far</dt>
                <dd className="text-foreground">
                  {numbers.length} of {batch.total_seal}
                </dd>
              </dl>
            </div>
          )}

          <div className="card p-6 space-y-3">
            <div className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-primary-600" />
              <div className="font-medium">Add Seal Numbers</div>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste one per line or separated by commas. Duplicates within
              the paste + collisions with existing rows surface as clear
              errors.
            </p>
            <textarea
              className="input"
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="SEAL-001&#10;SEAL-002&#10;SEAL-003"
              disabled={adding}
            />
            <div className="flex justify-end">
              <button
                onClick={addNumbers}
                disabled={adding || !pasteText.trim()}
                className="btn-primary"
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>

        {/* Right: numbers table */}
        <div className="lg:col-span-2">
          <div className="card">
            {selected.size > 0 && (
              <div className="p-3 border-b border-border bg-primary-50/40 flex items-center gap-3 flex-wrap">
                <div className="text-sm font-medium text-foreground">
                  {selected.size} selected
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="input max-w-[220px]"
                    placeholder="Reference info (optional)"
                    value={referenceInfo}
                    onChange={(e) => setReferenceInfo(e.target.value)}
                  />
                  <button
                    onClick={markUsed}
                    disabled={busy}
                    className="btn-primary"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Mark Used
                  </button>
                </div>
                <button
                  onClick={() => release()}
                  disabled={busy}
                  className="btn-secondary"
                >
                  <Undo2 className="h-4 w-4" /> Release
                </button>
                <button
                  onClick={deleteSelected}
                  disabled={busy}
                  className="btn-secondary text-red-600 dark:text-red-400"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="ml-auto text-sm text-muted-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="w-14">
                      {/* A switch has no indeterminate state, so the partial case is
                          carried by the "N selected" count above the table. */}
                      <Toggle
                        size="sm"
                        checked={allChecked}
                        onChange={toggleSelectAll}
                        disabled={numbers.length === 0}
                        aria-label={allChecked ? 'Deselect all numbers' : 'Select all numbers'}
                        title={someChecked ? 'Some numbers selected' : undefined}
                      />
                    </th>
                    <th className="w-12">#</th>
                    <th>Seal Number</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted-foreground py-8">
                        Loading...
                      </td>
                    </tr>
                  )}
                  {!loading && numbers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted-foreground py-8">
                        No numbers in this batch yet. Add them above.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    numbers.map((n, idx) => (
                      <tr
                        key={n.id}
                        className={
                          'hover:bg-muted/50 ' +
                          (selected.has(n.id) ? 'bg-primary-50/30' : '')
                        }
                      >
                        <td>
                          <Toggle
                            size="sm"
                            checked={selected.has(n.id)}
                            onChange={() => toggleSelect(n.id)}
                            aria-label={`Select ${n.seal_number}`}
                          />
                        </td>
                        <td className="text-muted-foreground font-medium">
                          {idx + 1}
                        </td>
                        <td>
                          <code className="text-sm">{n.seal_number}</code>
                        </td>
                        <td>
                          <span
                            className={
                              'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ' +
                              STATUS_STYLES[n.status]
                            }
                          >
                            {n.status === 'Used' && (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            {n.status === 'Damaged' && (
                              <XCircle className="h-3 w-3" />
                            )}
                            {n.status}
                          </span>
                        </td>
                        <td className="text-xs text-muted-foreground">
                          {n.notes ?? '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* The release was refused because these seals are still on export files.
          A question, not a result (§4.22) — so it names the files and the seals
          and offers a labelled way out (§4.21) rather than a bare "are you
          sure?". */}
      {detachAsk && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          onClick={() => setDetachAsk(null)}
        >
          <div className="card w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <span className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-foreground">
                  {detachAsk.seals.length === 1 ? 'This seal is' : 'These seals are'} already in use
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Releasing {detachAsk.seals.length === 1 ? 'it' : 'them'} removes the seal from the
                  export file below and reduces that file&apos;s <strong>No. of Seals</strong> to match.
                </p>
              </div>
            </div>

            <ul className="max-h-64 divide-y divide-border overflow-y-auto px-5 py-2">
              {detachAsk.holders.map((h) => (
                <li key={h.export_id} className="py-2 text-sm">
                  <span className="font-mono font-medium text-foreground">
                    {h.mca_ref ?? `export #${h.export_id}`}
                  </span>
                  <span className="ms-2 text-muted-foreground">
                    DGDA Seal No: {h.seal_numbers.join(', ')}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" onClick={() => setDetachAsk(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void release(true)}
                className="btn-primary disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" /> Remove and release
              </button>
            </div>
          </div>
        </div>
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
