'use client';

import { Check, Clock, RotateCcw, X } from 'lucide-react';
import { formatDateTime } from '@/lib/formatDate';
import { PAYMENT_STAGES, type PaymentStage } from '@/db/schema';
import { STAGE_LABELS } from '@/lib/payments/stages';

// §2 step 6 — who decided what, when, and what they said about it.
//
// The five stages of the payment chain, each with its verdict, its timestamp and
// its note. The old view showed a badge and an approver's name and nothing else,
// so "when did Finance sign this off" — the question an operator chasing a late
// payment actually has — could not be answered from the screen at all, although
// the columns holding the answer have existed since the table was created.
//
// Rendered inside RecordViewModal's `extra` slot rather than as page fields:
// this is workflow state, not input, so it has no row in the page config and
// never will (§4.5).

/** The columns the trail reads, as `GET /payments/{id}` returns them. */
export interface ApprovalTrailRow {
  resubmit_count?: number | null;
  resubmitted_at?: string | null;
  [key: string]: unknown;
}

/** Column names per stage, matching STAGE_COLUMNS on the server side. */
const COLUMNS: Record<PaymentStage, { approval: string; at: string; by: string; notes: string }> = {
  dept: { approval: 'dept_approval', at: 'dept_approved_at', by: 'dept_approved_by_name', notes: 'dept_notes' },
  finance: { approval: 'finance_approval', at: 'finance_approved_at', by: 'finance_approved_by_name', notes: 'finance_notes' },
  management: { approval: 'management_approval', at: 'management_approved_at', by: 'management_approved_by_name', notes: 'management_notes' },
  under_process: { approval: 'under_process', at: 'under_process_at', by: 'under_process_by_name', notes: 'under_process_notes' },
  paid: { approval: 'paid_approval', at: 'paid_approved_at', by: 'paid_approved_by_name', notes: 'paid_notes' },
};

/**
 * §4.32 — each verdict states both themes. The dark side is a translucent fill
 * of the mid shade with a light text step, never a `-700` on a dark card.
 */
const VERDICT = {
  approved: {
    label: 'Approved',
    chip: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    rail: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    chip: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
    rail: 'bg-red-500',
  },
  pending: {
    label: 'Pending',
    chip: 'bg-muted text-muted-foreground border-border',
    rail: 'bg-border',
  },
} as const;

function verdictOf(flag: unknown): keyof typeof VERDICT {
  if (flag === 1) return 'approved';
  if (flag === -1) return 'rejected';
  return 'pending';
}

export default function ApprovalTrail({ row }: { row: ApprovalTrailRow }): React.ReactElement {
  const resubmits = Number(row.resubmit_count ?? 0);

  return (
    <section className="rounded-xl border border-border overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-sky-500 to-indigo-600" />
      <div className="flex flex-wrap items-center justify-between gap-2 bg-sky-50 px-4 py-2.5 dark:bg-sky-500/10">
        <h3 className="font-semibold text-sky-900 dark:text-sky-200">Approval Trail</h3>
        {resubmits > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <RotateCcw className="h-3 w-3" />
            Re-submitted {resubmits === 1 ? 'once' : `${resubmits} times`}
            {row.resubmitted_at ? ` · last ${formatDateTime(row.resubmitted_at, '')}` : ''}
          </span>
        )}
      </div>

      <ol className="divide-y divide-border">
        {PAYMENT_STAGES.map((stage) => {
          const col = COLUMNS[stage];
          const verdict = VERDICT[verdictOf(row[col.approval])];
          const at = formatDateTime(row[col.at], '');
          const by = row[col.by];
          const note = row[col.notes];

          return (
            <li key={stage} className="flex gap-3 px-4 py-3">
              {/* The rail reads as a chain top-to-bottom, so an operator can see
                  how far a request has travelled without reading every row. */}
              <span
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${verdict.rail}`}
                aria-hidden="true"
              >
                {verdict.label === 'Approved' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : verdict.label === 'Rejected' ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{STAGE_LABELS[stage]}</span>
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${verdict.chip}`}>
                    {verdict.label}
                  </span>
                  {/* §4.19 — DD-MM-YYYY HH:mm, never a locale string. This is the
                      "date and time of each action" the trail exists to show. */}
                  {at && <span className="text-xs text-muted-foreground">{at}</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {by ? String(by) : <span className="italic">Not yet acted on</span>}
                </p>
                {note ? (
                  <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-xs text-foreground">
                    {String(note)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
