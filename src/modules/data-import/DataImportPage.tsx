'use client';

// Data Import — choose a module, upload a spreadsheet or a scan, review what was
// read, then create the records.
//
// The review step is the point of the screen: nothing is written until the
// operator has seen every value, corrected what the file got wrong, and left out
// the rows they do not want. Each row is then created through that module's own
// save route, so a refusal comes back in the module's own words (§4.23) against
// the row that caused it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDateTime } from '@/lib/formatDate';
import { missingRequired, type TargetField } from '@/lib/dataImport/mapping';

interface Target {
  id: number;
  target_key: string;
  name: string;
  handler: 'page' | 'users';
  page_slug: string | null;
  menu_url: string;
  hint: string | null;
}

interface Parsed {
  source: 'spreadsheet' | 'document';
  target: Target;
  fields: TargetField[];
  file_name: string;
  sheet_name: string | null;
  headings: string[];
  rows: Record<string, string>[];
  mapping: Record<string, string | null>;
  notes: string | null;
}

interface CommitResult {
  row_number: number;
  record_id: number | null;
  error: string | null;
}

interface BatchRow {
  id: number;
  target_key: string;
  target_name: string | null;
  file_name: string;
  source: string;
  row_count: number;
  created_count: number;
  failed_count: number;
  created_by_name: string | null;
  created_at: string;
}

const ACCEPT = '.xlsx,.xlsm,.csv,.tsv,.pdf,.png,.jpg,.jpeg,.webp';
/** Rows shown in the review grid at once; the rest still import. */
const PREVIEW_ROWS = 50;

export default function DataImportPage() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetKey, setTargetKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [remember, setRemember] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [results, setResults] = useState<CommitResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [history, setHistory] = useState<BatchRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void safeFetchJson<Target[]>('/api/v1/data-import/targets').then((r) => {
      if (r.ok) setTargets(r.data);
    });
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const r = await safeFetchJson<BatchRow[]>('/api/v1/data-import/batches');
    setHistory(r.ok ? r.data : []);
    setLoadingHistory(false);
  }, []);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const target = targets.find((t) => t.target_key === targetKey) ?? null;

  const reset = (): void => {
    setParsed(null);
    setRows([]);
    setMapping({});
    setSkipped(new Set());
    setResults(null);
    setError(null);
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const parse = async (chosen: File): Promise<void> => {
    if (!targetKey) {
      setError('Choose the module this file is for first.');
      return;
    }
    setParsing(true);
    setError(null);
    setResults(null);
    const form = new FormData();
    form.set('target_key', targetKey);
    form.set('file', chosen);
    const res = await safeFetchJson<Parsed>('/api/v1/data-import/parse', { method: 'POST', body: form });
    setParsing(false);
    if (!res.ok) {
      setError(res.message);
      setParsed(null);
      return;
    }
    setParsed(res.data);
    setMapping(res.data.mapping);
    setRows(res.data.rows);
    setSkipped(new Set());
  };

  const choose = (chosen: File | null): void => {
    setFile(chosen);
    if (chosen) void parse(chosen);
  };

  const fields = parsed?.fields ?? [];
  const fieldOptions = useMemo(
    () => fields.map((f) => ({ value: f.name, label: `${f.label}${f.required ? ' *' : ''}` })),
    [fields],
  );
  const unfilled = useMemo(() => (parsed ? missingRequired(mapping, fields) : []), [parsed, mapping, fields]);
  const importable = rows.map((_, i) => i).filter((i) => !skipped.has(i));

  const setCell = (rowIndex: number, heading: string, value: string): void =>
    setRows((prev) => prev.map((r, i) => (i === rowIndex ? { ...r, [heading]: value } : r)));

  const setColumnField = (heading: string, field: string): void =>
    setMapping((prev) => {
      const next = { ...prev, [heading]: field || null };
      // A field can only be fed once; claiming it frees the column that had it.
      if (field) for (const [k, v] of Object.entries(prev)) if (k !== heading && v === field) next[k] = null;
      return next;
    });

  const commit = async (): Promise<void> => {
    if (!parsed) return;
    setCommitting(true);
    setError(null);
    const payload = {
      target_key: parsed.target.target_key,
      file_name: parsed.file_name,
      source: parsed.source,
      mapping,
      remember_mapping: remember,
      rows: importable.map((i) => ({
        row_number: i + 1,
        values: Object.fromEntries(
          Object.entries(mapping)
            .filter(([, field]) => field)
            .map(([heading, field]) => [field as string, rows[i]?.[heading] ?? '']),
        ),
      })),
    };
    const res = await safeFetchJson<{ batch_id: number; created: number; failed: number; results: CommitResult[] }>(
      '/api/v1/data-import/commit',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    );
    setCommitting(false);
    if (!res.ok) {
      setError(res.message);
      setResult({ status: 'error', title: 'Not imported', message: res.message || 'The import could not be run.' });
      return;
    }
    setResults(res.data.results);
    const { created, failed } = res.data;
    setResult({
      status: failed === 0 ? 'success' : 'error',
      title: failed === 0 ? 'Imported' : created === 0 ? 'Nothing imported' : 'Imported with problems',
      message:
        failed === 0
          ? `${created} ${created === 1 ? 'record was' : 'records were'} created in ${parsed.target.name}.`
          : `${created} created, ${failed} refused. The refused rows are marked below with the reason.`,
    });
    void loadHistory();
  };

  const errorFor = (index: number): string | null =>
    results?.find((r) => r.row_number === index + 1)?.error ?? null;
  const createdId = (index: number): number | null =>
    results?.find((r) => r.row_number === index + 1)?.record_id ?? null;

  return (
    <>
      <div className="card mb-4 overflow-hidden">
        <div className="h-1 w-full bg-brand-gradient" />
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <FileUp className="h-5 w-5 text-primary-600" /> Data Import
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Upload a spreadsheet of rows, or a scanned document such as an ID card. You review everything before a
            single record is created.
          </p>
        </div>
      </div>

      {/* ---- Step 1 + 2: module and file ---------------------------------- */}
      <div className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 bg-brand-gradient px-4 py-3 text-white">
          <Upload className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Choose a module and a file</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
          <div className="min-w-0">
            <label className="label required">Module</label>
            <SearchableSelect
              value={targetKey}
              onChange={(v) => { setTargetKey(v); reset(); }}
              options={targets.map((t) => ({ value: t.target_key, label: t.name }))}
              placeholder="What is this file for?"
              required
              aria-label="Module"
            />
            {target?.hint && <p className="mt-2 text-xs text-muted-foreground">{target.hint}</p>}
          </div>

          <div
            className={`lg:col-span-2 flex min-h-[132px] flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition ${
              dragging ? 'border-primary-600 bg-primary-50/60' : 'border-input bg-muted/30'
            } ${!targetKey ? 'opacity-60' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (targetKey) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (targetKey) choose(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              id="import-file"
              disabled={!targetKey || parsing}
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
            />
            {parsing ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading {file?.name}…
              </p>
            ) : (
              <>
                <div className="mb-2 flex gap-2 text-muted-foreground">
                  <FileSpreadsheet className="h-6 w-6" />
                  <ImageIcon className="h-6 w-6" />
                </div>
                <p className="text-sm text-foreground">
                  {file ? file.name : 'Drop a file here, or'}{' '}
                  <label htmlFor="import-file" className="cursor-pointer font-semibold text-primary-600 hover:underline">
                    browse
                  </label>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Spreadsheet (.xlsx, .csv) for many records — PDF or photo (.pdf, .png, .jpg) for one scanned document.
                </p>
              </>
            )}
          </div>
        </div>
        {error && (
          <p className="flex items-start gap-2 border-t border-border bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
      </div>

      {/* ---- Step 3: review ------------------------------------------------ */}
      {parsed && (
        <div className="card mb-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-brand-gradient px-4 py-3 text-white">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4" /> Review before importing
            </h2>
            <span className="text-xs text-white/85">
              {parsed.source === 'document' ? 'Read from the scan' : `${rows.length} row${rows.length === 1 ? '' : 's'}`}
              {parsed.sheet_name ? ` — sheet "${parsed.sheet_name}"` : ''} — {importable.length} to import
            </span>
          </div>

          {parsed.notes && (
            <p className="flex items-start gap-2 border-b border-border bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> The scan was unclear in places: {parsed.notes}
            </p>
          )}
          {unfilled.length > 0 && (
            <p className="flex items-start gap-2 border-b border-border bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Nothing feeds {unfilled.map((f) => f.label).join(', ')}, which {unfilled.length === 1 ? 'is' : 'are'} required —
              point a column at {unfilled.length === 1 ? 'it' : 'them'} below, or the rows will be refused.
            </p>
          )}

          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  <th className="w-12 border-b border-border px-2 py-2 text-left font-bold uppercase text-foreground">#</th>
                  {parsed.headings.map((h) => (
                    <th key={h} className="min-w-[190px] border-b border-border px-2 py-2 text-left align-top">
                      <span className="block truncate font-bold uppercase text-foreground" title={h}>{h}</span>
                      <span className="mt-1 block">
                        <SearchableSelect
                          size="sm"
                          value={mapping[h] ?? ''}
                          onChange={(v) => setColumnField(h, v)}
                          options={fieldOptions}
                          emptyLabel="— Do not import —"
                          placeholder="— Do not import —"
                          aria-label={`Field for column ${h}`}
                        />
                      </span>
                    </th>
                  ))}
                  <th className="w-24 border-b border-border px-2 py-2 text-left font-bold uppercase text-foreground">Row</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PREVIEW_ROWS).map((row, i) => {
                  const rowError = errorFor(i);
                  const id = createdId(i);
                  return (
                    <tr
                      key={i}
                      className={`border-b border-border ${
                        skipped.has(i) ? 'opacity-40' : rowError ? 'bg-red-50 dark:bg-red-500/10' : id ? 'bg-emerald-50 dark:bg-emerald-500/10' : ''
                      }`}
                    >
                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                      {parsed.headings.map((h) => (
                        <td key={h} className="px-1 py-1">
                          <input
                            className="input h-8 w-full min-w-0 px-1.5 text-xs"
                            value={row[h] ?? ''}
                            disabled={!mapping[h] || skipped.has(i) || Boolean(id)}
                            onChange={(e) => setCell(i, h, e.target.value)}
                            aria-label={`${h}, row ${i + 1}`}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1">
                        {id ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" /> #{id}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSkipped((prev) => {
                              const next = new Set(prev);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              return next;
                            })}
                            className={skipped.has(i) ? 'text-xs font-medium text-primary-600' : 'ico-delete'}
                            title={skipped.has(i) ? 'Include this row' : 'Leave this row out'}
                            aria-label={skipped.has(i) ? `Include row ${i + 1}` : `Leave out row ${i + 1}`}
                          >
                            {skipped.has(i) ? 'Include' : <Trash2 className="h-4 w-4" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {results && results.some((r) => r.error) && (
            <div className="border-t border-border px-4 py-3">
              <p className="mb-1 text-sm font-semibold text-foreground">Rows the module refused</p>
              <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">
                {results.filter((r) => r.error).map((r) => (
                  <li key={r.row_number}>Row {r.row_number}: {r.error}</li>
                ))}
              </ul>
            </div>
          )}

          {rows.length > PREVIEW_ROWS && (
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              Showing the first {PREVIEW_ROWS} rows — all {rows.length} will be imported.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3">
            <Toggle
              checked={remember}
              onChange={setRemember}
              label="Remember these column names for next time"
            />
            <div className="flex gap-2">
              <button type="button" onClick={reset} className="btn-secondary btn-sm">
                <RotateCcw className="h-4 w-4" /> Start over
              </button>
              <button
                type="button"
                onClick={() => void commit()}
                disabled={committing || importable.length === 0}
                className="btn-primary"
              >
                {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {committing ? 'Importing…' : `Import ${importable.length} row${importable.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- History -------------------------------------------------------- */}
      <DataTable<BatchRow>
        rows={history}
        loading={loadingHistory}
        rowKey={(r) => r.id}
        title="Past imports"
        searchPlaceholder="Search module, file, who imported, date..."
        emptyMessage="Nothing has been imported yet — choose a module above to start."
        columns={[
          { key: 'target_name', header: 'Module', render: (r) => r.target_name ?? r.target_key },
          { key: 'file_name', header: 'File', className: 'font-medium' },
          {
            key: 'source',
            header: 'Kind',
            render: (r) => (
              <span className="inline-flex items-center gap-1.5">
                {r.source === 'document' ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
                {r.source === 'document' ? 'Scan' : 'Spreadsheet'}
              </span>
            ),
          },
          { key: 'row_count', header: 'Rows', align: 'right' },
          {
            key: 'created_count',
            header: 'Created',
            align: 'right',
            render: (r) => <span className="font-semibold text-emerald-700 dark:text-emerald-300">{r.created_count}</span>,
          },
          {
            key: 'failed_count',
            header: 'Refused',
            align: 'right',
            render: (r) =>
              r.failed_count > 0 ? (
                <span className="font-semibold text-red-700 dark:text-red-300">{r.failed_count}</span>
              ) : (
                <span className="text-muted-foreground">0</span>
              ),
          },
          { key: 'created_by_name', header: 'By', render: (r) => r.created_by_name ?? '—' },
          { key: 'created_at', header: 'When', render: (r) => formatDateTime(r.created_at) },
        ]}
      />

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
