import { PAYMENT_STAGES, type PaymentStage } from '@/db/schema';
import { applicableStages, DEFAULT_STAGES, type StageDef } from './stageConfig';

// The Payment Request approval chain's RULES, over the chain's CONFIG.
//
// Which stages exist, their order, their names and which payment types they
// apply to all come from payment_stage_master_t (§4.1) and arrive here as a
// `StageDef[]`. Nothing below names a stage — the chain is walked in the order
// the master gives. Every function takes the stage list, and defaults to the
// seeded chain so a caller that has not loaded it still gets the right answer.

// Column names per approval stage. under_process breaks the `*_approved_*`
// naming (it uses `under_process` / `under_process_by`), so keep an explicit map.
// This is the one fixed thing: each slot is a set of columns on the table.
export const STAGE_COLUMNS: Record<PaymentStage, { approval: string; at: string; by: string; notes: string }> = {
  dept: { approval: 'dept_approval', at: 'dept_approved_at', by: 'dept_approved_by', notes: 'dept_notes' },
  finance: { approval: 'finance_approval', at: 'finance_approved_at', by: 'finance_approved_by', notes: 'finance_notes' },
  management: { approval: 'management_approval', at: 'management_approved_at', by: 'management_approved_by', notes: 'management_notes' },
  under_process: { approval: 'under_process', at: 'under_process_at', by: 'under_process_by', notes: 'under_process_notes' },
  paid: { approval: 'paid_approval', at: 'paid_approved_at', by: 'paid_approved_by', notes: 'paid_notes' },
};

// A payment row's raw approval columns (numbers or null) + payment_type.
export interface PaymentApprovalState {
  payment_type: string | null;
  dept_approval: number | null;
  finance_approval: number | null;
  management_approval: number | null;
  under_process: number | null;
  paid_approval: number | null;
}

/**
 * What `pay_for` 0–4 are called.
 *
 * Indexed by the stored smallint, matching main's ordering. The authoritative
 * copy is the `pay_for` field's `options_static` in the page config, which is
 * what the FORM renders from; this is the read-side twin for the places that
 * have a number and no page config to hand — the list badge, the Excel export,
 * the references modal.
 *
 * TODO(config): move to `pay_for_master_t` so the two stop being two.
 */
export const PAY_FOR_LABELS = ['Import', 'Export', 'Local', 'Other', 'Pre Payment'] as const;

/** One stage's tri-state flag off a row, whatever shape the row arrived in. */
export function flagOf(p: PaymentApprovalState, stage: PaymentStage): number | null {
  const v = (p as unknown as Record<string, unknown>)[STAGE_COLUMNS[stage].approval];
  return v == null ? null : Number(v);
}

/**
 * Rejected at ANY slot — including one since switched off. A rejection that was
 * recorded stays a rejection; turning the stage off later must not quietly
 * un-reject a request nobody corrected.
 */
export function isRejected(p: PaymentApprovalState): boolean {
  return PAYMENT_STAGES.some((s) => flagOf(p, s) === -1);
}

/** WHERE it was rejected — the trail needs to name the stage, not just the fact. */
export function rejectedStage(p: PaymentApprovalState): PaymentStage | null {
  return PAYMENT_STAGES.find((s) => flagOf(p, s) === -1) ?? null;
}

/**
 * Whether the request's STATE permits editing, ignoring who is asking.
 *
 *   1. Once the FIRST stage of its chain has approved, the request is locked —
 *      an approver signed off on a beneficiary, an amount and an expense type.
 *   2. A REJECTED request is editable again, wherever it was rejected — that is
 *      what rejection is FOR. Saving it clears the chain (`willResubmitOnSave`).
 */
export function isEditableState(p: PaymentApprovalState, stages: readonly StageDef[] = DEFAULT_STAGES): boolean {
  if (isRejected(p)) return true;
  const first = applicableStages(stages, p.payment_type)[0];
  return !first || flagOf(p, first.stage) !== 1;
}

/**
 * Whether THIS user may edit the request: the state allows it AND they raised
 * it. An approver who disagrees rejects with a reason rather than rewriting the
 * request into something the requester never asked for.
 */
export function canEditRequest(
  p: PaymentApprovalState,
  createdBy: number | null | undefined,
  userId: number,
  stages: readonly StageDef[] = DEFAULT_STAGES,
): boolean {
  if (createdBy == null || createdBy !== userId) return false;
  return isEditableState(p, stages);
}

/** Saving a rejected request IS its re-submission — the save clears every flag. */
export function willResubmitOnSave(p: PaymentApprovalState): boolean {
  return isRejected(p);
}

/**
 * `rejected`, `paid` (the chain is complete), or `waiting_<stage>`.
 *
 * `paid` names the finished state for historical reasons — the list, the cards
 * and the export already filter on it. Its LABEL is the last stage's name.
 */
export type PaymentStatusKey = 'rejected' | 'paid' | `waiting_${PaymentStage}`;

export interface PaymentStatus {
  key: PaymentStatusKey;
  label: string;
  /** The ONE stage this row is waiting on, or null when it is finished. */
  stage: PaymentStage | null;
}

/**
 * The row's derived status: the first stage of its chain not yet approved.
 *
 * `paymentStatusSql` in db/queries/payments.ts is this same walk as a SQL CASE,
 * built from the same StageDef list — so a card and the badge it filters to
 * cannot disagree (§4.10).
 */
export function paymentStatus(p: PaymentApprovalState, stages: readonly StageDef[] = DEFAULT_STAGES): PaymentStatus {
  if (isRejected(p)) return { key: 'rejected', label: 'Rejected', stage: null };
  const chain = applicableStages(stages, p.payment_type);
  for (const s of chain) {
    if (flagOf(p, s.stage) !== 1) return { key: `waiting_${s.stage}`, label: s.pending_label, stage: s.stage };
  }
  return { key: 'paid', label: chain.at(-1)?.label ?? 'Completed', stage: null };
}

/**
 * Validate that `stage` may be approved now. Returns a message naming what is
 * missing, or null when the transition is allowed.
 */
export function checkApprovable(
  stage: PaymentStage,
  p: PaymentApprovalState,
  stages: readonly StageDef[] = DEFAULT_STAGES,
): string | null {
  if (isRejected(p)) return 'This request was rejected at an earlier stage.';
  const def = stages.find((s) => s.stage === stage);
  if (!def) return `The ${stage.replace('_', ' ')} stage is switched off in Payment Stages.`;
  if (def.payment_type && def.payment_type !== p.payment_type) {
    return `${def.label} applies to ${def.payment_type} payments only.`;
  }
  if (flagOf(p, stage) === 1) return `${def.label} has already approved this request.`;

  const chain = applicableStages(stages, p.payment_type);
  const missing = chain.slice(0, chain.findIndex((s) => s.stage === stage)).filter((s) => flagOf(p, s.stage) !== 1);
  if (missing.length > 0) {
    return `${missing.map((s) => s.label).join(' and ')} approval ${missing.length === 1 ? 'is' : 'are'} required first.`;
  }
  return null;
}

/**
 * Whether `stage` may be rejected now — only the stage the request is waiting
 * on. Rejecting an earlier, already-approved stage would rewrite a decision; a
 * later one has not been reached.
 */
export function checkRejectable(
  stage: PaymentStage,
  p: PaymentApprovalState,
  stages: readonly StageDef[] = DEFAULT_STAGES,
): string | null {
  if (isRejected(p)) return 'This request has already been rejected.';
  const status = paymentStatus(p, stages);
  if (status.stage == null) return 'This request has completed its approvals and can no longer be rejected.';
  if (status.stage !== stage) {
    const current = stages.find((s) => s.stage === status.stage)?.label ?? status.stage;
    return `This request is waiting on ${current}, not on this stage.`;
  }
  return null;
}
