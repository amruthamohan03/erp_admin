'use client';

// §2 step 6 — the Payment Request "View" dialog, laid out as main's
// payment.php #viewModal: one narrow column that reads top to bottom —
//
//   Payment Information   a two-column label / value table
//   Motif / Reason        the requester's own words
//   Attached Documents    one button per file (Documents 1–4)
//   References (N)        # / Reference / Amount, with the total
//   Approval Timeline     one column per stage of THIS request's chain
//   rejection notes       a red line per stage that refused it
//
// The chain (names, order, which stages a Bank or Cash request passes through,
// badge hues) is payment_stage_master_t — handed in as `stages`, never stated
// here. Colours are tokens or the stage's configured tone (§4.20, §4.32).
import { useEffect, useRef } from 'react';
import { Eye, FileText, Info, X } from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { PAY_FOR_LABELS, STAGE_COLUMNS, flagOf, paymentStatus, type PaymentApprovalState } from '@/lib/payments/stages';
import {
  DONE_TONE,
  REJECTED_TONE,
  applicableStages,
  badgeClass,
  type StageDef,
  type ToneKey,
} from '@/lib/payments/stageConfig';

interface McaLine {
  mca_ref: string;
  amount: number;
}

interface Props {
  id: number;
  /** null while the detail is loading. */
  detail: Record<string, unknown> | null;
  stages: readonly StageDef[];
  onClose: () => void;
}

const money = (v: unknown): string => {
  const n = Number(v);
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const text = (v: unknown): string => (v == null || String(v).trim() === '' ? 'N/A' : String(v));

function Badge({ tone, children }: { tone: ToneKey; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass(tone)}`}>
      {children}
    </span>
  );
}

/** The file's extension, from its stored original name — "Document 1 (.pdf)". */
function extOf(name: unknown): string {
  const m = /\.([a-z0-9]{1,6})$/iu.exec(String(name ?? ''));
  return m ? `.${m[1].toLowerCase()}` : '';
}

export default function PaymentViewModal({ id, detail, stages, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // §4.21 — Escape leaves, and focus starts on the labelled way out.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const d = detail;
  const state = d as unknown as PaymentApprovalState | null;
  const chain = state ? applicableStages(stages, state.payment_type) : [];
  const status = state ? paymentStatus(state, stages) : null;
  const statusTone: ToneKey = !status
    ? 'slate'
    : status.key === 'rejected'
      ? REJECTED_TONE
      : status.key === 'paid'
        ? DONE_TONE
        : (stages.find((s) => s.stage === status.stage)?.tone ?? 'slate');

  const lines: McaLine[] = d && Array.isArray(d.mca_data) ? (d.mca_data as McaLine[]) : [];
  const refsTotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const docs = d
    ? [1, 2, 3, 4]
        .map((n) => ({ n, id: d[`file${n}_path`], name: d[`file${n}_name`] }))
        .filter((f) => f.id != null && String(f.id).trim() !== '')
    : [];

  const rejections = d
    ? stages
        .filter((s) => state && flagOf(state, s.stage) === -1 && d[STAGE_COLUMNS[s.stage].notes])
        .map((s) => ({ label: s.label, note: String(d[STAGE_COLUMNS[s.stage].notes]) }))
    : [];

  const infoRows: Array<[string, React.ReactNode]> = d
    ? [
        ['ID', `#${id}`],
        ['Status', status ? <Badge tone={statusTone}>{status.label}</Badge> : 'N/A'],
        ['Department', text(d.department_name)],
        ['Location', text(d.location_name)],
        ['Beneficiary', text(d.beneficiary)],
        ['Requestee', text(d.requestee)],
        ['Client', text(d.client_name)],
        ['Payment For', d.pay_for == null ? 'N/A' : (PAY_FOR_LABELS[Number(d.pay_for)] ?? 'N/A')],
        ['Payment Type', text(d.payment_type)],
        ['Currency', text(d.currency_short_name)],
        ['Amount', <strong key="amt" className="tabular-nums">{money(d.amount)}</strong>],
        ['Expense Type', text(d.expense_type_name)],
        ['Cash Collector', text(d.cash_collector)],
        ['Chargeback', d.chargeback == null ? 'N/A' : money(d.chargeback)],
        ['Created Date', formatDateTime(d.created_at, 'N/A')],
        ['Updated Date', formatDateTime(d.updated_at, 'N/A')],
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-view-title"
        className="card my-auto w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 id="payment-view-title" className="flex items-center gap-2 font-semibold text-foreground">
            <Eye className="h-4 w-4" /> Payment Request Details
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 text-sm">
          {!d ? (
            <div className="space-y-2" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-6 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <>
              <h3 className="mb-2 font-semibold text-foreground">Payment Information</h3>
              <table className="w-full border-collapse border border-border text-[13px]">
                <tbody>
                  {infoRows.map(([label, value]) => (
                    <tr key={label}>
                      <th className="w-2/5 border border-border bg-muted/60 px-2.5 py-1.5 text-left font-semibold text-foreground">
                        {label}
                      </th>
                      <td className="border border-border px-2.5 py-1.5 text-foreground">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 className="mb-2 mt-4 font-semibold text-foreground">Motif / Reason</h3>
              <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/60 p-2 text-[13px] text-foreground">
                {text(d.motif)}
              </div>

              <h3 className="mb-2 mt-4 font-semibold text-foreground">Attached Documents</h3>
              {docs.length === 0 ? (
                <p className="flex items-center gap-1 text-muted-foreground">
                  <Info className="h-4 w-4" /> No documents attached
                </p>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {docs.map((f) => (
                    <a
                      key={f.n}
                      href={`/api/v1/files/${String(f.id)}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={f.name ? String(f.name) : `Document ${f.n}`}
                      // The brand gradient — the configured palette, not a fixed purple.
                      className="bg-brand-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <FileText className="h-4 w-4" />
                      Document {f.n}
                      {extOf(f.name) && ` (${extOf(f.name)})`}
                    </a>
                  ))}
                </div>
              )}

              <h3 className="mb-2 mt-4 font-semibold text-foreground">References ({lines.length})</h3>
              {lines.length === 0 ? (
                <p className="text-muted-foreground">No references found</p>
              ) : (
                <div className="max-h-[200px] overflow-y-auto">
                  <table className="w-full border-collapse border border-border text-[13px]">
                    <thead>
                      <tr className="bg-muted/60">
                        <th className="w-12 border border-border px-2 py-1 text-left">#</th>
                        <th className="border border-border px-2 py-1 text-left">Reference</th>
                        <th className="w-28 border border-border px-2 py-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={`${l.mca_ref}-${i}`}>
                          <td className="border border-border px-2 py-1 text-muted-foreground">{i + 1}</td>
                          <td className="border border-border px-2 py-1 font-mono">{l.mca_ref}</td>
                          <td className="border border-border px-2 py-1 text-right tabular-nums">{money(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/40 font-semibold">
                        <td colSpan={2} className="border border-border px-2 py-1 text-right">Total:</td>
                        <td className="border border-border px-2 py-1 text-right tabular-nums">{money(refsTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <h3 className="mb-2 mt-4 font-semibold text-foreground">Approval Timeline</h3>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse border border-border text-[13px]">
                  <thead>
                    <tr className="bg-muted/60">
                      {chain.map((s) => (
                        <th key={s.stage} className="border border-border px-2 py-2 text-center font-semibold">
                          {s.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {chain.map((s) => {
                        const flag = state ? flagOf(state, s.stage) : null;
                        const c = STAGE_COLUMNS[s.stage];
                        return (
                          <td key={s.stage} className="border border-border px-2 py-2 text-center align-top">
                            {flag === 1 ? (
                              <Badge tone={DONE_TONE}>{s.stage === chain.at(-1)?.stage ? s.label : 'Approved'}</Badge>
                            ) : flag === -1 ? (
                              <Badge tone={REJECTED_TONE}>Rejected</Badge>
                            ) : (
                              <Badge tone={s.tone}>{s.pending_label}</Badge>
                            )}
                            {flag != null && (
                              <>
                                <span className="mt-1 block text-xs text-muted-foreground">{text(d[`${c.by}_name`])}</span>
                                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                  {formatDateTime(d[c.at], '')}
                                </span>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {rejections.map((r) => (
                <div
                  key={r.label}
                  className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-[13px] text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                >
                  <strong>{r.label} Rejection:</strong> {r.note}
                </div>
              ))}

              {Number(d.resubmit_count) > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Re-submitted {String(d.resubmit_count)} time{Number(d.resubmit_count) === 1 ? '' : 's'}
                  {d.resubmitted_at ? ` — last on ${formatDate(d.resubmitted_at)}` : ''}.
                </p>
              )}
            </>
          )}
        </div>

        {/* §4.21 — a labelled way out, always. */}
        <div className="flex justify-end border-t border-border px-5 py-3">
          <button ref={closeRef} type="button" onClick={onClose} className="btn-secondary btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
