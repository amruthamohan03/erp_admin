'use client';

// §3 Sydonia bulk-update UI, shared by Import & Export Sydonia.
//
// Upload an Excel whose column A holds MCA references → the server checks every
// reference against the tracking table → the screen LEADS with two lists: the
// references it found, in green, and the ones it cannot add data to, in red,
// each with the reason. The row-by-row table sits underneath for detail.
//
// The two lists are the point. The previous version marked each row green or red
// inside a table, which is unreadable the moment a file runs past a screenful:
// finding the eight failures in four hundred rows meant scrolling and squinting.
// A reference an operator can read, count and copy is what actually gets acted on.
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Search,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate } from '@/lib/formatDate';

type RowStatus = 'ready' | 'missing' | 'deleted' | 'empty' | 'duplicate';

interface Row {
  excel_row: number;
  mca_ref: string;
  declaration_reference: string;
  declaration_date: string;
  liquidation_reference: string;
  liquidation_date: string;
  quittance_reference: string;
  quittance_date: string;
  liquidation_amount: string;
  status: RowStatus;
  reason: string;
  warnings: string[];
  parsed: Record<string, string>;
  record_id: number | null;
}

interface Validation {
  rows: Row[];
  total: number;
  found_refs: string[];
  blocked: Array<{ mca_ref: string; excel_row: number; status: RowStatus; reason: string }>;
  counts: Record<'ready' | 'missing' | 'deleted' | 'empty' | 'duplicate' | 'warnings', number>;
}

interface UpdateResult {
  updated: number;
  failed: number;
  updatedRefs: string[];
  errors: string[];
}

/** Every blocking reason, with the heading and the fix shown above its chips. */
const BLOCKED_GROUPS: Array<{ status: RowStatus; title: string; fix: string }> = [
  {
    status: 'missing',
    title: 'Not in the database',
    fix: 'These references do not exist, so there is no record to add the data to. Check the spelling, or create the record first.',
  },
  {
    status: 'deleted',
    title: 'Deleted',
    fix: 'These records exist but have been deleted. Restore them from the Recycle Bin, then upload the file again.',
  },
  {
    status: 'empty',
    title: 'Nothing to add',
    fix: 'These references were found, but columns B to H hold nothing that can be written.',
  },
  {
    status: 'duplicate',
    title: 'Listed more than once',
    fix: 'Only the first row for a reference is applied. Merge the duplicate rows in the file if the later ones carry different values.',
  },
];

export default function SydoniaBulkUpdate({ kind }: { kind: 'import' | 'export' }) {
  const [phase, setPhase] = useState<'upload' | 'processing' | 'preview' | 'saving' | 'done'>('upload');
  const [check, setCheck] = useState<Validation | null>(null);
  const [outcome, setOutcome] = useState<UpdateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState<'all' | RowStatus>('all');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const label = kind === 'import' ? 'Import' : 'Export';
  // Memoised so the empty-array fallback is not a fresh reference on every render,
  // which would re-run every derived list below for nothing.
  const rows = useMemo(() => check?.rows ?? [], [check]);
  const readyRows = useMemo(() => rows.filter((r) => r.status === 'ready'), [rows]);
  const blockedCount = rows.length - readyRows.length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) => (filter === 'all' || r.status === filter) && (!q || r.mca_ref.toLowerCase().includes(q)),
    );
  }, [rows, filter, search]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!/\.(xlsx|xls)$/i.test(file.name)) {
        setError(`Only Excel files are accepted — "${file.name}" is not .xlsx or .xls.`);
        return;
      }
      setError(null);
      setPhase('processing');
      const fd = new FormData();
      fd.append('file', file);
      const res = await safeFetchJson<Validation>(`/api/v1/sydonia/${kind}/validate`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        setError(res.message);
        setPhase('upload');
        return;
      }
      setCheck(res.data);
      setFilter('all');
      setSearch('');
      setPhase('preview');
    },
    [kind],
  );

  async function commit() {
    if (readyRows.length === 0) return;
    setPhase('saving');
    setError(null);
    const res = await safeFetchJson<UpdateResult>(`/api/v1/sydonia/${kind}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: readyRows }),
    });
    if (!res.ok) {
      setError(res.message);
      setPhase('preview');
      setResult({ status: 'error', title: 'Not updated', message: res.message, detail: res.detail });
      return;
    }
    setOutcome(res.data);
    setPhase('done');
    setResult({
      status: 'success',
      title: 'Data added',
      message: `${res.data.updated} ${label.toLowerCase()} record${res.data.updated === 1 ? '' : 's'} updated from the file.`,
      detail: res.data.failed > 0 ? `${res.data.failed} row${res.data.failed === 1 ? '' : 's'} could not be applied.` : undefined,
    });
  }

  function reset() {
    setCheck(null);
    setOutcome(null);
    setError(null);
    setFilter('all');
    setSearch('');
    setPhase('upload');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function copyRefs(refs: string[], token: string) {
    try {
      await navigator.clipboard.writeText(refs.join('\n'));
      setCopied(token);
      window.setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
    } catch {
      setError('The browser blocked access to the clipboard — select the references and copy them manually.');
    }
  }

  return (
    <>
      {/* Header + progress. Three steps, so the operator knows a file is checked
          before anything is written — the review step is not a formality. */}
      <div className="card mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <FileSpreadsheet className="h-5 w-5 text-primary-600" /> Sydonia {label} — Bulk Update
          </h1>
          <ol className="flex items-center gap-1 text-xs">
            {(['Upload', 'Review', 'Done'] as const).map((step, i) => {
              const active =
                (i === 0 && phase === 'upload') ||
                (i === 1 && (phase === 'processing' || phase === 'preview' || phase === 'saving')) ||
                (i === 2 && phase === 'done');
              const past =
                (i === 0 && phase !== 'upload') || (i === 1 && phase === 'done');
              return (
                <li key={step} className="flex items-center gap-1">
                  {i > 0 && <span className="mx-1 h-px w-6 bg-border" />}
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                      active
                        ? 'bg-primary-600 text-white'
                        : past
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {past ? '✓' : i + 1}
                  </span>
                  <span className={active ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{step}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {phase === 'upload' && (
        <div className="card p-5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className={`w-full rounded-xl border-[3px] border-dashed px-6 py-14 text-center transition ${
              dragOver
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                : 'border-border bg-muted/50 hover:border-primary-500 hover:bg-primary-50/40'
            }`}
          >
            <UploadCloud className="mx-auto mb-3 h-12 w-12 text-primary-500" />
            <div className="text-lg font-semibold text-foreground">Drag &amp; drop the Excel file here</div>
            <div className="mt-1 text-sm text-muted-foreground">or click to browse — .xlsx or .xls, up to 8 MB</div>
          </button>

          {/* The column map, laid out as the sheet is, so it can be checked at a glance. */}
          <div className="mt-5 overflow-x-auto rounded-lg border border-border">
            <table className="table-base text-xs">
              <thead>
                <tr>
                  <th className="w-12">Col</th>
                  <th>Holds</th>
                  <th>Written to</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-mono font-bold">A</td>
                  <td className="font-semibold text-foreground">MCA Reference</td>
                  <td className="text-muted-foreground">Identifies the record — must already exist</td>
                </tr>
                {[
                  ['B', 'Declaration Reference', 'declaration_reference'],
                  ['C', 'Declaration Date', 'dgda_in_date'],
                  ['D', 'Liquidation Reference', 'liquidation_reference'],
                  ['E', 'Liquidation Date', 'liquidation_date'],
                  ['F', 'Quittance Reference', 'quittance_reference'],
                  ['G', 'Quittance Date', 'quittance_date'],
                  ['H', 'Liquidation Amount', 'liquidation_amount'],
                ].map(([col, holds, target]) => (
                  <tr key={col}>
                    <td className="font-mono font-bold">{col}</td>
                    <td>{holds}</td>
                    <td className="font-mono text-muted-foreground">{target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            An empty cell keeps whatever the record already holds — nothing is ever blanked, and no new record is
            created. Dates are read day-first ({formatDate('2026-08-03')} is 3 August).
          </p>
        </div>
      )}

      {phase === 'processing' && (
        <div className="card py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary-600" />
          Checking every reference against the {label.toLowerCase()} records…
        </div>
      )}

      {(phase === 'preview' || phase === 'saving') && check && (
        <>
          {/* ── The answer, before the detail ──────────────────────────────── */}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <RefPanel
              tone="ok"
              icon={<CheckCircle2 className="h-5 w-5" />}
              title={`${readyRows.length} reference${readyRows.length === 1 ? '' : 's'} found`}
              subtitle={
                readyRows.length > 0
                  ? `Columns B to H will be added to ${readyRows.length === 1 ? 'this record' : 'these records'}.`
                  : 'Nothing in this file can be applied.'
              }
              refs={readyRows.map((r) => r.mca_ref)}
              copied={copied === 'ok'}
              onCopy={() => void copyRefs(readyRows.map((r) => r.mca_ref), 'ok')}
            />

            <div
              className={`card p-4 ${
                blockedCount > 0 ? 'border-red-200 dark:border-red-500/30' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span className={blockedCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}>
                    <XCircle className="h-5 w-5" />
                  </span>
                  <div>
                    <div className={`font-bold ${blockedCount > 0 ? 'text-red-700 dark:text-red-300' : 'text-foreground'}`}>
                      {blockedCount} reference{blockedCount === 1 ? '' : 's'} cannot be updated
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {blockedCount > 0
                        ? 'Their data will not be added. Fix the file and upload it again.'
                        : 'Every reference in the file was matched.'}
                    </div>
                  </div>
                </div>
                {blockedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void copyRefs(check.blocked.map((b) => b.mca_ref), 'bad')}
                    className="btn-secondary btn-sm shrink-0"
                    title="Copy these references"
                  >
                    {copied === 'bad' ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === 'bad' ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>

              {BLOCKED_GROUPS.map((g) => {
                const refs = check.blocked.filter((b) => b.status === g.status);
                if (refs.length === 0) return null;
                return (
                  <div key={g.status} className="mt-3 border-t border-border pt-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                      {g.title} — {refs.length}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{g.fix}</p>
                    <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-auto">
                      {refs.map((b) => (
                        <span
                          key={`${b.excel_row}-${b.mca_ref}`}
                          title={`Row ${b.excel_row} of the sheet`}
                          className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-xs font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                        >
                          {b.mca_ref}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {check.counts.warnings > 0 && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                {check.counts.warnings} row{check.counts.warnings === 1 ? '' : 's'} will be applied with a cell skipped
              </div>
              <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto text-xs text-amber-800 dark:text-amber-300">
                {rows
                  .filter((r) => r.warnings.length > 0)
                  .flatMap((r) => r.warnings.map((w, k) => (
                    <li key={`${r.excel_row}-${k}`}>
                      <span className="font-mono font-semibold">{r.mca_ref}</span> — {w}
                    </li>
                  )))}
              </ul>
            </div>
          )}

          {/* ── Row-by-row detail ──────────────────────────────────────────── */}
          <div className="card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="input ps-8"
                  placeholder="Search MCA reference..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search MCA reference"
                />
              </div>
              {([
                ['all', `All ${rows.length}`],
                ['ready', `Ready ${check.counts.ready}`],
                ['missing', `Missing ${check.counts.missing}`],
                ['deleted', `Deleted ${check.counts.deleted}`],
                ['empty', `No data ${check.counts.empty}`],
                ['duplicate', `Duplicate ${check.counts.duplicate}`],
              ] as const).map(([key, text]) => {
                const n = key === 'all' ? rows.length : check.counts[key];
                if (key !== 'all' && n === 0) return null;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    aria-pressed={filter === key}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      filter === key
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {text}
                  </button>
                );
              })}
              <button type="button" onClick={reset} className="btn-secondary btn-sm ms-auto">
                <RotateCcw className="h-3.5 w-3.5" /> Start over
              </button>
            </div>

            <div className="max-h-[480px] overflow-auto rounded-lg border border-border">
              <table className="table-base whitespace-nowrap text-xs">
                <thead className="sticky top-0">
                  <tr>
                    <th className="w-12">Sheet row</th>
                    <th>MCA Ref</th>
                    <th>Declaration Ref</th>
                    <th>Declaration Date</th>
                    <th>Liquidation Ref</th>
                    <th>Liquidation Date</th>
                    <th>Quittance Ref</th>
                    <th>Quittance Date</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-muted-foreground">
                        No rows match this filter.
                      </td>
                    </tr>
                  )}
                  {visible.map((r) => {
                    const ready = r.status === 'ready';
                    // Show the value that will be WRITTEN, not the raw cell — a date
                    // the sheet spells oddly is otherwise indistinguishable from one
                    // that parsed, right up until it silently fails to save.
                    const cell = (key: string, raw: string, isDate = false) => {
                      const v = r.parsed[key];
                      if (!raw) return <span className="text-muted-foreground">—</span>;
                      if (!v) return <span className="text-amber-700 line-through dark:text-amber-400">{raw}</span>;
                      return <span>{isDate ? formatDate(v) : v}</span>;
                    };
                    return (
                      <tr
                        key={`${r.excel_row}-${r.mca_ref}`}
                        className={ready ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'}
                      >
                        <td className="text-muted-foreground tabular-nums">{r.excel_row}</td>
                        <td className={`font-mono font-semibold ${ready ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'}`}>
                          {r.mca_ref}
                        </td>
                        <td>{cell('declaration_reference', r.declaration_reference)}</td>
                        <td>{cell('declaration_date', r.declaration_date, true)}</td>
                        <td>{cell('liquidation_reference', r.liquidation_reference)}</td>
                        <td>{cell('liquidation_date', r.liquidation_date, true)}</td>
                        <td>{cell('quittance_reference', r.quittance_reference)}</td>
                        <td>{cell('quittance_date', r.quittance_date, true)}</td>
                        <td className="text-right tabular-nums">{cell('liquidation_amount', r.liquidation_amount)}</td>
                        <td title={r.reason || undefined}>
                          {ready ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" /> Will update
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-500/20 dark:text-red-300">
                              <XCircle className="h-3 w-3" />
                              {r.status === 'missing' && 'Not in database'}
                              {r.status === 'deleted' && 'Deleted'}
                              {r.status === 'empty' && 'Nothing to add'}
                              {r.status === 'duplicate' && 'Duplicate'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {blockedCount > 0 && (
                <span className="me-auto text-xs text-muted-foreground">
                  {blockedCount} row{blockedCount === 1 ? '' : 's'} will be skipped.
                </span>
              )}
              <button type="button" onClick={reset} className="btn-secondary">Cancel</button>
              <button
                type="button"
                onClick={commit}
                disabled={readyRows.length === 0 || phase === 'saving'}
                className="btn-primary disabled:opacity-50"
              >
                {phase === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Add data to {readyRows.length} record{readyRows.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </>
      )}

      {phase === 'done' && outcome && (
        <div className="card p-6">
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-emerald-500" />
            <h2 className="text-lg font-bold text-foreground">
              {outcome.updated} record{outcome.updated === 1 ? '' : 's'} updated
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Columns B to H were added to the {label.toLowerCase()} records below.
            </p>
          </div>

          {outcome.updatedRefs.length > 0 && (
            <div className="mx-auto mt-4 max-w-3xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Updated references
                </span>
                <button
                  type="button"
                  onClick={() => void copyRefs(outcome.updatedRefs, 'done')}
                  className="btn-secondary btn-sm"
                >
                  {copied === 'done' ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === 'done' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex max-h-52 flex-wrap gap-1.5 overflow-auto rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                {outcome.updatedRefs.map((ref) => (
                  <span
                    key={ref}
                    className="rounded-md border border-emerald-200 bg-card px-2 py-0.5 font-mono text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300"
                  >
                    {ref}
                  </span>
                ))}
              </div>
            </div>
          )}

          {outcome.errors.length > 0 && (
            <ul className="mx-auto mt-4 max-h-40 max-w-3xl overflow-auto rounded-md border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              {outcome.errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}

          <div className="mt-6 text-center">
            <button type="button" onClick={reset} className="btn-primary">
              <UploadCloud className="h-4 w-4" /> Upload another file
            </button>
          </div>
        </div>
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

/** The green half of the verdict — the references that will be written. */
function RefPanel({
  tone,
  icon,
  title,
  subtitle,
  refs,
  copied,
  onCopy,
}: {
  tone: 'ok';
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  refs: string[];
  copied: boolean;
  onCopy: () => void;
}) {
  const empty = refs.length === 0;
  return (
    <div className={`card p-4 ${empty ? '' : 'border-emerald-200 dark:border-emerald-500/30'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className={empty ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400'}>{icon}</span>
          <div>
            <div className={`font-bold ${empty ? 'text-foreground' : 'text-emerald-700 dark:text-emerald-300'}`}>
              {title}
            </div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        {!empty && (
          <button type="button" onClick={onCopy} className="btn-secondary btn-sm shrink-0" title="Copy these references">
            {copied ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {!empty && (
        <div className="mt-3 flex max-h-52 flex-wrap gap-1.5 overflow-auto border-t border-border pt-3" data-tone={tone}>
          {refs.map((ref) => (
            <span
              key={ref}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              {ref}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
