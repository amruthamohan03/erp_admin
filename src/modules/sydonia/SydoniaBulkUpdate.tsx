'use client';

// §3 Sydonia bulk-update UI (shared by Import & Export Sydonia). Upload an Excel
// of MCA refs → server parses + validates against the tracking table → preview
// (valid = green, invalid = red) → commit only the valid rows. Ports the legacy
// importsydonia / exportsydonia screens; the file is parsed server-side (exceljs)
// so there's no client Excel dependency.
import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle2, XCircle, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';

interface Row {
  mca_ref: string;
  declaration_reference: string;
  declaration_date: string;
  liquidation_reference: string;
  liquidation_date: string;
  quittance_reference: string;
  quittance_date: string;
  liquidation_amount: string;
  valid: boolean;
}
interface UpdateResult {
  updated: number;
  failed: number;
  errors: string[];
}

export default function SydoniaBulkUpdate({ kind }: { kind: 'import' | 'export' }) {
  const [phase, setPhase] = useState<'upload' | 'processing' | 'preview' | 'saving' | 'done'>('upload');
  const [rows, setRows] = useState<Row[]>([]);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.length - validCount;

  const handleFile = useCallback(
    async (file: File) => {
      if (!/\.(xlsx|xls)$/i.test(file.name)) {
        setError('Only Excel files (.xlsx, .xls) are allowed.');
        return;
      }
      setError(null);
      setPhase('processing');
      try {
        const fd = new FormData();
        fd.append('file', file);
        const j = await fetch(`/api/v1/sydonia/${kind}/validate`, { method: 'POST', body: fd }).then((r) => r.json());
        if (!j.ok) {
          setError(j.error?.message ?? 'Validation failed');
          setPhase('upload');
          return;
        }
        setRows(j.data.rows);
        setPhase('preview');
      } catch {
        setError('Network error while validating the file.');
        setPhase('upload');
      }
    },
    [kind],
  );

  async function commit() {
    const valid = rows.filter((r) => r.valid);
    if (valid.length === 0) return;
    setPhase('saving');
    setError(null);
    try {
      const j = await fetch(`/api/v1/sydonia/${kind}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: valid }),
      }).then((r) => r.json());
      if (!j.ok) {
        setError(j.error?.message ?? 'Update failed');
        setPhase('preview');
        return;
      }
      setResult(j.data);
      setPhase('done');
    } catch {
      setError('Network error while updating.');
      setPhase('preview');
    }
  }

  function reset() {
    setRows([]);
    setResult(null);
    setError(null);
    setPhase('upload');
    if (fileRef.current) fileRef.current.value = '';
  }

  const label = kind === 'import' ? 'Import' : 'Export';

  return (
    <>
      <div className="card p-4 mb-4">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary-600" /> Sydonia {label} — Bulk Update
        </h1>
      </div>

      <div className="card p-5">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Upload zone */}
        {phase === 'upload' && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
            className={`w-full rounded-xl border-[3px] border-dashed py-14 px-6 text-center transition ${dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:border-primary-500 hover:bg-primary-50/40'}`}
          >
            <UploadCloud className="h-12 w-12 mx-auto text-primary-500 mb-3" />
            <div className="text-lg font-semibold text-slate-800">Drag &amp; drop the Excel file here</div>
            <div className="text-sm text-slate-500 mt-1">or click to browse</div>
            <div className="mt-4 inline-block text-left text-xs text-slate-500 leading-relaxed">
              <strong>Excel format:</strong><br />
              • <strong>Column A:</strong> MCA Ref (required — must exist in the {label.toLowerCase()} table)<br />
              • <strong>B</strong> Declaration Ref, <strong>C</strong> Declaration Date, <strong>D</strong> Liquidation Ref, <strong>E</strong> Liquidation Date<br />
              • <strong>F</strong> Quittance Ref, <strong>G</strong> Quittance Date, <strong>H</strong> Amount<br />
              • Only non-empty fields are updated; empty cells keep the existing value.
            </div>
          </button>
        )}

        {phase === 'processing' && (
          <div className="py-12 text-center text-slate-500">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary-600 mb-3" />
            Validating records against the database…
          </div>
        )}

        {/* Preview */}
        {(phase === 'preview' || phase === 'saving') && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-2 mb-3">
              <div className="text-sm text-sky-900">
                <strong>Validation complete:</strong>
                <span className="ml-2 inline-block rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-semibold">{validCount} valid</span>
                <span className="ml-2 inline-block rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-semibold">{invalidCount} invalid</span>
              </div>
              <button type="button" onClick={reset} className="btn-secondary inline-flex items-center gap-1.5 text-xs">
                <RotateCcw className="h-3.5 w-3.5" /> Upload another file
              </button>
            </div>

            <div className="overflow-auto rounded-lg border border-slate-200 max-h-[520px]">
              <table className="table-base whitespace-nowrap text-xs">
                <thead className="sticky top-0">
                  <tr>
                    <th className="w-10">#</th>
                    <th>MCA Ref</th>
                    <th>Declaration Ref</th>
                    <th>Declaration Date</th>
                    <th>Liquidation Ref</th>
                    <th>Liquidation Date</th>
                    <th>Quittance Ref</th>
                    <th>Quittance Date</th>
                    <th className="text-right">Amount</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={r.valid ? 'bg-emerald-50' : 'bg-red-50'}>
                      <td className="text-slate-400">{i + 1}</td>
                      <td className="font-mono font-semibold">{r.mca_ref}</td>
                      <td>{r.declaration_reference || '—'}</td>
                      <td>{r.declaration_date || '—'}</td>
                      <td>{r.liquidation_reference || '—'}</td>
                      <td>{r.liquidation_date || '—'}</td>
                      <td>{r.quittance_reference || '—'}</td>
                      <td>{r.quittance_date || '—'}</td>
                      <td className="text-right tabular-nums">{r.liquidation_amount || '—'}</td>
                      <td className="text-center">
                        {r.valid ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold"><CheckCircle2 className="h-3 w-3" /> Found</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-[10px] font-semibold"><XCircle className="h-3 w-3" /> Not found</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <button type="button" onClick={commit} disabled={validCount === 0 || phase === 'saving'}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                {phase === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Update {validCount} record{validCount === 1 ? '' : 's'}
                {invalidCount > 0 ? ` (skip ${invalidCount})` : ''}
              </button>
            </div>
          </>
        )}

        {/* Done */}
        {phase === 'done' && result && (
          <div className="py-10 text-center">
            <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500 mb-3" />
            <h2 className="text-lg font-bold text-slate-900">Update complete</h2>
            <p className="text-slate-600 mt-1">
              Successfully updated <strong>{result.updated}</strong> record{result.updated === 1 ? '' : 's'}.
              {result.failed > 0 && (
                <span className="text-amber-600"><br />{result.failed} record{result.failed === 1 ? '' : 's'} failed / unchanged.</span>
              )}
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-3 mx-auto max-w-md text-left text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 max-h-40 overflow-auto">
                {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            )}
            <button type="button" onClick={reset} className="btn-primary inline-flex items-center gap-1.5 mt-5">
              <UploadCloud className="h-4 w-4" /> Upload another file
            </button>
          </div>
        )}
      </div>
    </>
  );
}
