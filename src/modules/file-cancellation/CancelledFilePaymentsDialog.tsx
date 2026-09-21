'use client';

// The payment requests raised against a cancelled file — their status and
// amount — and, for the ones already PAID, the recollection of that money: how
// much has been recovered and when, or that it has been written off.
//
// Opened from the Payments icon in the Cancelled Files list. The requests
// themselves are never changed here; this records the recovery against them.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Banknote, CheckCircle2, ExternalLink, Undo2, X } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate, toDateInputValue } from '@/lib/formatDate';

export interface FilePayment {
  payment_id: number;
  mca_ref: string;
  file_id: number;
  requestee: string | null;
  beneficiary: string | null;
  amount: number;
  currency: string | null;
  status_key: string;
  status_label: string;
  paid: boolean;
  created_at: string | null;
  recollection_id: number | null;
  recollection_status: string | null;
  recovered_amount: number | null;
  recovered_date: string | null;
}

const money = (n: number): string => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = (): string => toDateInputValue(new Date().toISOString().slice(0, 10));

/** Paid, in approval, rejected — each reads at a glance. */
function statusBadge(p: FilePayment): string {
  if (p.paid) return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
  if (p.status_key === 'rejected') return 'border-border bg-muted text-muted-foreground';
  return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200';
}

function recollectionText(p: FilePayment): string | null {
  if (!p.recollection_status) return null;
  if (p.recollection_status === 'recovered') {
    return `Recovered ${money(p.recovered_amount ?? 0)}${p.recovered_date ? ` on ${formatDate(p.recovered_date)}` : ''}`;
  }
  if (p.recollection_status === 'written_off') return `Written off${p.recovered_date ? ` on ${formatDate(p.recovered_date)}` : ''}`;
  return 'To recollect';
}

/** The requests as a compact table — also used inside the cancellation confirmation. */
export function PaymentList({
  payments,
  onRecollect,
}: {
  payments: FilePayment[];
  onRecollect?: (p: FilePayment) => void;
}) {
  const total = payments.reduce((s, p) => s + p.amount, 0);
  const paidTotal = payments.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);
  const currency = payments.find((p) => p.currency)?.currency ?? '';
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold text-foreground">Request</th>
            <th className="px-2 py-1.5 text-left font-semibold text-foreground">Beneficiary</th>
            <th className="px-2 py-1.5 text-left font-semibold text-foreground">Status</th>
            <th className="px-2 py-1.5 text-right font-semibold text-foreground">Amount</th>
            {onRecollect && <th className="px-2 py-1.5 text-right font-semibold text-foreground">Recollection</th>}
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const rec = recollectionText(p);
            return (
              <tr key={p.payment_id} className="border-t border-border">
                <td className="px-2 py-1.5">
                  <Link href="/payments" className="inline-flex items-center gap-1 font-mono text-primary-600 hover:underline" title="Open Payment Requests">
                    #{p.payment_id} <ExternalLink className="h-3 w-3" />
                  </Link>
                  {p.created_at && <span className="block text-[11px] text-muted-foreground">{formatDate(p.created_at)}</span>}
                </td>
                <td className="px-2 py-1.5 text-foreground">
                  <span className="block max-w-[10rem] truncate" title={p.beneficiary ?? p.requestee ?? ''}>
                    {p.beneficiary || p.requestee || '—'}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(p)}`}>{p.status_label}</span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-foreground">
                  {money(p.amount)} {p.currency ?? ''}
                </td>
                {onRecollect && (
                  <td className="px-2 py-1.5 text-right">
                    {!p.paid ? (
                      <span className="text-muted-foreground">Not paid</span>
                    ) : rec && p.recollection_status !== 'pending' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {rec}
                      </span>
                    ) : (
                      <button type="button" onClick={() => onRecollect(p)} className="btn-approve btn-sm">
                        <Undo2 className="h-3.5 w-3.5" /> Recollect
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-border bg-muted/50">
          <tr>
            <td colSpan={3} className="px-2 py-1.5 text-right font-semibold text-foreground">
              Total{paidTotal > 0 ? ` — paid ${money(paidTotal)} ${currency}` : ''}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums font-bold text-foreground">
              {money(total)} {currency}
            </td>
            {onRecollect && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const OUTCOMES = [
  { value: 'recovered', label: 'Recovered' },
  { value: 'written_off', label: 'Written off (not recoverable)' },
];

interface Props {
  kind: string;
  fileId: number;
  fileRef: string;
  onClose: () => void;
  /** The list's to-recollect figure changed. */
  onChanged: () => void;
}

export default function CancelledFilePaymentsDialog({ kind, fileId, fileRef, onClose, onChanged }: Props) {
  const [payments, setPayments] = useState<FilePayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FilePayment | null>(null);
  const [status, setStatus] = useState('recovered');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    const res = await safeFetchJson<FilePayment[]>(`/api/v1/file-cancellations/payments?kind=${kind}&file_id=${fileId}`);
    if (res.ok) {
      setPayments(res.data);
      setError(null);
    } else setError(res.message);
  }, [kind, fileId]);
  useEffect(() => {
    void load();
  }, [load]);

  const startRecollect = (p: FilePayment): void => {
    setEditing(p);
    setStatus('recovered');
    setAmount(String(p.amount));
    setDate(today());
    setNote('');
    setInvalid(null);
  };

  const save = async (): Promise<void> => {
    if (!editing?.recollection_id) {
      setResult({
        status: 'error',
        title: 'Not saved',
        message: 'This payment has no recollection opened — it was paid after the file was cancelled, or before recollections existed.',
      });
      return;
    }
    setSaving(true);
    const res = await safeFetchJson(`/api/v1/file-cancellations/recollections/${editing.recollection_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        recovered_amount: status === 'recovered' ? Number(amount) : null,
        recovered_date: date || null,
        note: note.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setInvalid(res.field ?? null);
      setResult({ status: 'error', title: 'Not saved', message: res.message || 'The recollection could not be saved.' });
      return;
    }
    setResult({
      status: 'success',
      title: 'Saved',
      message:
        status === 'recovered'
          ? `${money(Number(amount))} ${editing.currency ?? ''} recovered on payment request #${editing.payment_id}.`
          : `Payment request #${editing.payment_id} is recorded as written off.`,
    });
    setEditing(null);
    void load();
    onChanged();
  };

  const toRecollect = (payments ?? []).filter((p) => p.paid && p.recollection_status === 'pending');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="file-payments-title">
      <div className="card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 bg-brand-gradient px-5 py-4 text-white">
          <span className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
              <Banknote className="h-5 w-5" />
            </span>
            <span>
              <h2 id="file-payments-title" className="font-semibold">Payment requests on {fileRef}</h2>
              <span className="block text-xs text-white/85">
                {toRecollect.length > 0
                  ? `${toRecollect.length} paid request${toRecollect.length === 1 ? '' : 's'} still to recollect`
                  : 'Nothing left to recollect on this file'}
              </span>
            </span>
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded p-1 hover:bg-white/15">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : payments === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment request was raised against this file.</p>
          ) : (
            <PaymentList payments={payments} onRecollect={startRecollect} />
          )}

          {editing && (
            <div className="rounded-md border border-border bg-muted/40 p-4">
              <p className="mb-3 text-sm font-semibold text-foreground">
                Recollect payment request #{editing.payment_id} — paid {money(editing.amount)} {editing.currency ?? ''}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="min-w-0">
                  <label className="label required">Outcome</label>
                  <SearchableSelect value={status} onChange={setStatus} options={OUTCOMES} aria-label="Outcome" />
                </div>
                {status === 'recovered' && (
                  <div className="min-w-0">
                    <label htmlFor="rec-amount" className="label required">Recovered Amount</label>
                    <input
                      id="rec-amount"
                      type="number"
                      step="0.01"
                      min={0}
                      max={editing.amount}
                      className="input"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      aria-invalid={invalid === 'recovered_amount' || undefined}
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <label htmlFor="rec-date" className="label required">{status === 'recovered' ? 'Recovered On' : 'Written Off On'}</label>
                  <input
                    id="rec-date"
                    type="date"
                    className="input"
                    value={date}
                    max={today()}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    aria-invalid={invalid === 'recovered_date' || undefined}
                  />
                </div>
                <div className="min-w-0 sm:col-span-3">
                  <label htmlFor="rec-note" className="label">Note</label>
                  <input
                    id="rec-note"
                    className="input"
                    value={note}
                    maxLength={1000}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. refunded by the beneficiary, receipt no. …"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} className="btn-secondary btn-sm">Cancel</button>
                <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary btn-sm">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </div>
  );
}
