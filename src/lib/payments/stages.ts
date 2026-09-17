import { PAYMENT_STAGES, type PaymentStage } from '@/db/schema';

// Column names per approval stage. under_process breaks the `*_approved_*`
// naming (it uses `under_process` / `under_process_by`), so keep an explicit map.
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
 * TODO(config): move to `pay_for_master_t` so the two stop being two. It is a
 * closed set that main hardcodes and that nothing configures today, so a master
 * table would be config nobody edits — but the moment a sixth category is
 * wanted, this array and the seed's `options_static` are the two places that
 * have to agree, and that is the point at which it should become a row (§4.1).
 */
export const PAY_FOR_LABELS = ['Import', 'Export', 'Local', 'Other', 'Pre Payment'] as const;

/** What each stage is called on screen, in a spreadsheet, and in a message. */
export const STAGE_LABELS: Record<PaymentStage, string> = {
  dept: 'Department',
  finance: 'Finance',
  management: 'Management',
  under_process: 'Under Process',
  paid: 'Paid',
};

/** One stage's tri-state flag off a row, whatever shape the row arrived in. */
function flagOf(p: PaymentApprovalState, stage: PaymentStage): number | null {
  switch (stage) {
    case 'dept':
      return p.dept_approval;
    case 'finance':
      return p.finance_approval;
    case 'management':
      return p.management_approval;
    case 'under_process':
      return p.under_process;
    case 'paid':
      return p.paid_approval;
  }
}

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
 * Two rules, and the order between them is the whole point:
 *
 *   1. Once the DEPARTMENT has approved, the request is locked. An approver
 *      signed off on a beneficiary, an amount and an expense type; letting the
 *      requester change any of those afterwards would carry that signature onto
 *      a document nobody approved.
 *   2. A REJECTED request is editable again, wherever in the chain it was
 *      rejected — that is what rejection is FOR. It has been handed back to be
 *      corrected, so a dept approval further up the chain no longer stands in
 *      the way, and saving it clears the whole chain back to pending anyway
 *      (see `willResubmitOnSave`).
 *
 * So rejection wins over the lock. Without rule 2 a request rejected by Finance
 * would be frozen with nobody able to act on it: the requester could not fix it
 * and no approver could advance it.
 */
export function isEditableState(p: PaymentApprovalState): boolean {
  if (isRejected(p)) return true;
  return p.dept_approval !== 1;
}

/**
 * Whether THIS user may edit the request.
 *
 * The state has to allow it AND the user has to be the one who raised it. The
 * second half is not a permission check that the stage→role map could express:
 * a request is a person's own statement of what they need paid, and an approver
 * who disagrees with it rejects it with a reason rather than rewriting it into
 * something the requester never asked for. Approving something you edited
 * yourself is the specific outcome this prevents.
 *
 * `createdBy` is null on rows whose author has been removed; nobody inherits the
 * request, so it is no longer editable by anyone. Rejecting it remains possible,
 * which is the right escape hatch.
 */
export function canEditRequest(
  p: PaymentApprovalState,
  createdBy: number | null | undefined,
  userId: number,
): boolean {
  if (createdBy == null || createdBy !== userId) return false;
  return isEditableState(p);
}

/**
 * Whether saving this request will send it back round the approval chain.
 *
 * Re-submission is not a separate action — correcting a rejected request and
 * saving it IS the re-submission, which is main's behaviour and the right one:
 * an edit followed by a second, separate "now really send it" click is a state
 * where the request has been fixed and nobody is looking at it. The save clears
 * every stage flag so the corrected request starts again at Department.
 */
export function willResubmitOnSave(p: PaymentApprovalState): boolean {
  return isRejected(p);
}

export type PaymentStatusKey =
  | 'rejected'
  | 'paid'
  | 'waiting_dept'
  | 'waiting_finance'
  | 'waiting_mgmt'
  | 'waiting_under_process'
  | 'waiting_payment';

export interface PaymentStatus {
  key: PaymentStatusKey;
  label: string;
  /** The ONE stage this row is waiting on, or null when it is finished. */
  stage: PaymentStage | null;
}

/**
 * The row's derived status.
 *
 * Here rather than on the list page because three readers need the same answer:
 * the grid's badge, the Excel export's Status column, and the status-count
 * cards' SQL buckets. Two of those used to derive it independently and the
 * third in SQL — the keys below are deliberately the same strings
 * `statusCond()` filters on, so a card and the badge it filters to cannot
 * disagree (§4.10).
 */
export function paymentStatus(p: PaymentApprovalState): PaymentStatus {
  if (isRejected(p)) return { key: 'rejected', label: 'Rejected', stage: null };
  if (p.paid_approval === 1) return { key: 'paid', label: 'Paid', stage: null };
  if (p.dept_approval == null) return { key: 'waiting_dept', label: 'Pending Dept', stage: 'dept' };
  if (p.finance_approval == null)
    return { key: 'waiting_finance', label: 'Pending Finance', stage: 'finance' };
  if (p.management_approval == null)
    return { key: 'waiting_mgmt', label: 'Pending Mgmt', stage: 'management' };
  if (p.payment_type === 'Bank' && p.under_process == null)
    return { key: 'waiting_under_process', label: 'Under Process', stage: 'under_process' };
  return { key: 'waiting_payment', label: 'Pending Payment', stage: 'paid' };
}

/**
 * Validate that `stage` may be approved now. Returns an error message, or null
 * when the transition is allowed. Mirrors main's validateApprovalWorkflow +
 * under_process rules.
 */
export function checkApprovable(stage: PaymentStage, p: PaymentApprovalState): string | null {
  if (isRejected(p)) return 'This request was rejected at an earlier stage.';
  const done = (v: number | null) => v === 1;

  switch (stage) {
    case 'dept':
      if (done(p.dept_approval)) return 'Department has already approved this request.';
      break;
    case 'finance':
      if (!done(p.dept_approval)) return 'Department approval is required first.';
      if (done(p.finance_approval)) return 'Finance has already approved this request.';
      break;
    case 'management':
      if (!done(p.dept_approval) || !done(p.finance_approval)) return 'Department and Finance approval are required first.';
      if (done(p.management_approval)) return 'Management has already approved this request.';
      break;
    case 'under_process':
      if (p.payment_type !== 'Bank') return 'Under Process applies to Bank payments only.';
      if (!done(p.dept_approval) || !done(p.finance_approval) || !done(p.management_approval)) return 'All prior approvals are required first.';
      if (done(p.under_process)) return 'This payment is already Under Process.';
      break;
    case 'paid':
      if (!done(p.dept_approval) || !done(p.finance_approval) || !done(p.management_approval)) return 'All prior approvals are required before marking as Paid.';
      if (p.payment_type === 'Bank' && !done(p.under_process)) return 'Bank payments must be Under Process before being marked Paid.';
      if (done(p.paid_approval)) return 'This payment is already marked as Paid.';
      break;
  }
  return null;
}
