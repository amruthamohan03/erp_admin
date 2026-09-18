'use client';

// §2 step 5 — the "Pending for invoicing" card's modal, shared by the export and
// import invoice lists (ports main's pending-MCA modal). Lists every cleared file
// no live invoice carries yet, a client summary above it, and lets the operator
// hold a file back from invoicing with a reason — or release it again. The
// spreadsheet lists the held-back files on their own sheet.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import Toggle from '@/components/ui/Toggle';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate } from '@/lib/formatDate';

type Kind = 'export' | 'import';

interface PendingFile {
  id: number;
  mca_ref: string | null;
  client_id: number | null;
  client_code: string | null;
  client_name: string | null;
  quittance_date: string | null;
  weight: number;
  fob: number;
  disabled: boolean;
  remark: string | null;
}

const num = (n: number, d = 2): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

interface Props {
  kind: Kind;
  open: boolean;
  onClose: () => void;
  /** Called after a file is held back or released, so the card's count refreshes. */
  onChanged?: () => void;
}

export default function PendingInvoicingModal({ kind, open, onClose, onChanged }: Props) {
  const [rows, setRows] = useState<PendingFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState<string | null>(null);
  const [toggle, setToggle] = useState<{ row: PendingFile; disabled: boolean } | null>(null);
  const [remark, setRemark] = useState('');
  const [remarkMissing, setRemarkMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await safeFetchJson<PendingFile[]>(`/api/v1/${kind}-invoices/pending`);
    setLoading(false);
    if (res.ok) setRows(res.data);
    else setResult({ status: 'error', title: 'Not loaded', message: res.message || 'The pending files could not be loaded.' });
  }, [kind]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void load();
  }, [open, load]);

  // One chip per client: how many of its files are still to invoice.
  const clients = useMemo(() => {
    const m = new Map<string, { code: string; active: number; held: number }>();
    for (const r of rows) {
      const code = r.client_code ?? '—';
      const c = m.get(code) ?? { code, active: 0, held: 0 };
      if (r.disabled) c.held += 1;
      else c.active += 1;
      m.set(code, c);
    }
    return [...m.values()];
  }, [rows]);

  const shown = useMemo(() => (client ? rows.filter((r) => (r.client_code ?? '—') === client) : rows), [rows, client]);
  const activeCount = rows.filter((r) => !r.disabled).length;

  async function commitToggle(): Promise<void> {
    if (!toggle) return;
    if (toggle.disabled && !remark.trim()) {
      setRemarkMissing(true);
      return;
    }
    setBusy(true);
    const res = await safeFetchJson(`/api/v1/${kind}-invoices/pending/${toggle.row.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: toggle.disabled, remark: toggle.disabled ? remark.trim() : null }),
    });
    setBusy(false);
    const ref = toggle.row.mca_ref ?? `#${toggle.row.id}`;
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not saved', message: res.message || `${ref} could not be updated.` });
      return;
    }
    setToggle(null);
    setResult({
      status: 'success',
      title: 'Saved',
      message: toggle.disabled
        ? `${ref} is held back from invoicing and no longer counted as pending.`
        : `${ref} is back on the pending list.`,
    });
    void load();
    onChanged?.();
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 sm:p-8 overflow-y-auto" onClick={onClose}>
        <div className="card w-full max-w-6xl my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-sky-500 to-blue-600">
            <h2 className="font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5" /> Pending for Invoicing — {kind === 'export' ? 'Export' : 'Import'} files
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{activeCount}</span>
            </h2>
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/20" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>

          <div className="p-4 space-y-3">
            {clients.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setClient(null)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${client === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-muted/50'}`}
                >
                  All clients · {rows.length}
                </button>
                {clients.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setClient(client === c.code ? null : c.code)}
                    title={c.held ? `${c.held} held back` : undefined}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${client === c.code ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-muted/50'}`}
                  >
                    {c.code} · {c.active}{c.held ? <span className="ms-1 text-amber-600 dark:text-amber-400">(+{c.held})</span> : null}
                  </button>
                ))}
              </div>
            )}

            <DataTable<PendingFile>
              tableId={`${kind}-invoices-pending`}
              rows={shown}
              loading={loading}
              rowKey={(r) => r.id}
              searchPlaceholder="Search MCA ref, client..."
              exportHref={`/api/v1/${kind}-invoices/pending/export`}
              emptyMessage="Nothing is waiting — every cleared file is on an invoice."
              columns={[
                { key: 'client_code', header: 'Client', sortable: true, value: (r) => `${r.client_code ?? ''} ${r.client_name ?? ''}`, render: (r) => <span title={r.client_name ?? undefined}>{r.client_code ?? '—'}</span> },
                { key: 'mca_ref', header: 'MCA Reference', sortable: true, className: 'font-mono font-medium' },
                { key: 'quittance_date', header: 'Quittance Date', sortable: true, render: (r) => formatDate(r.quittance_date) },
                { key: 'weight', header: kind === 'export' ? 'Weight (MT)' : 'Weight (KG)', align: 'right', className: 'tabular-nums', render: (r) => num(r.weight, kind === 'export' ? 3 : 2) },
                { key: 'fob', header: 'FOB (USD)', align: 'right', className: 'tabular-nums', render: (r) => num(r.fob) },
                {
                  key: 'disabled',
                  header: 'Invoicing',
                  value: (r) => (r.disabled ? `Held back ${r.remark ?? ''}` : 'Pending'),
                  render: (r) => (
                    <div className="flex items-center gap-2 min-w-0">
                      <Toggle
                        size="sm"
                        checked={!r.disabled}
                        onChange={(on) => { setRemark(''); setRemarkMissing(false); setToggle({ row: r, disabled: !on }); }}
                        aria-label={`Include ${r.mca_ref ?? r.id} in invoicing`}
                      />
                      {r.disabled ? (
                        <span className="truncate text-xs text-amber-700 dark:text-amber-300" title={r.remark ?? undefined}>
                          Held back{r.remark ? ` — ${r.remark}` : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pending</span>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button type="button" onClick={onClose} className="btn-secondary">Close</button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!toggle}
        title={toggle?.disabled ? 'Hold back from invoicing' : 'Release for invoicing'}
        confirmLabel={toggle?.disabled ? 'Hold back' : 'Release'}
        busy={busy}
        onCancel={() => setToggle(null)}
        onConfirm={() => void commitToggle()}
      >
        {toggle?.disabled ? (
          <div className="space-y-2">
            <p>
              <strong className="text-foreground">{toggle.row.mca_ref}</strong> ({toggle.row.client_code}) stays listed here but
              stops counting as pending.
            </p>
            <label className="label required" htmlFor="pending-remark">Reason</label>
            <textarea
              id="pending-remark"
              className="input min-h-[72px]"
              required
              maxLength={500}
              value={remark}
              aria-invalid={remarkMissing || undefined}
              onChange={(e) => { setRemark(e.target.value); setRemarkMissing(false); }}
              placeholder="Why is this file not being invoiced?"
            />
            {remarkMissing && (
              <p className="text-xs text-red-600 dark:text-red-400">Reason is required — say why this file is being held back.</p>
            )}
          </div>
        ) : toggle ? (
          <p>
            Put <strong className="text-foreground">{toggle.row.mca_ref}</strong> back on the pending list
            {toggle.row.remark ? <> — it was held back for: “{toggle.row.remark}”</> : null}.
          </p>
        ) : null}
      </ConfirmDialog>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
