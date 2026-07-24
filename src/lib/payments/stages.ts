import type { PaymentStage } from '@/db/schema';

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

function isRejected(p: PaymentApprovalState): boolean {
  return [p.dept_approval, p.finance_approval, p.management_approval, p.under_process, p.paid_approval].some((v) => v === -1);
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
