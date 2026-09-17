import { describe, expect, it } from 'vitest';
import {
  canEditRequest,
  isEditableState,
  isRejected,
  paymentStatus,
  rejectedStage,
  willResubmitOnSave,
  type PaymentApprovalState,
} from './stages';

// The rules three callers depend on agreeing: the list grid (what it offers),
// the page save route (what it allows) and the resubmit route (what it accepts).
// They were derived independently before, which is how a grid can offer an Edit
// the server refuses.

const base: PaymentApprovalState = {
  payment_type: 'Cash',
  dept_approval: null,
  finance_approval: null,
  management_approval: null,
  under_process: null,
  paid_approval: null,
};

const row = (patch: Partial<PaymentApprovalState>): PaymentApprovalState => ({ ...base, ...patch });

describe('isRejected / rejectedStage', () => {
  it('is false for a request nobody has touched', () => {
    expect(isRejected(base)).toBe(false);
    expect(rejectedStage(base)).toBeNull();
  });

  it('finds a rejection at any stage, not just the first', () => {
    expect(isRejected(row({ dept_approval: 1, finance_approval: -1 }))).toBe(true);
    expect(rejectedStage(row({ dept_approval: 1, finance_approval: -1 }))).toBe('finance');
    expect(rejectedStage(row({ dept_approval: 1, finance_approval: 1, management_approval: 1, under_process: 1, paid_approval: -1 }))).toBe('paid');
  });

  it('does not read an approval as a rejection', () => {
    expect(isRejected(row({ dept_approval: 1, finance_approval: 1 }))).toBe(false);
  });
});

describe('isEditableState', () => {
  it('allows editing while the Department has not yet approved', () => {
    expect(isEditableState(base)).toBe(true);
  });

  it('locks the request once the Department has approved', () => {
    expect(isEditableState(row({ dept_approval: 1 }))).toBe(false);
    expect(isEditableState(row({ dept_approval: 1, finance_approval: 1 }))).toBe(false);
  });

  it('reopens a request rejected at the Department', () => {
    expect(isEditableState(row({ dept_approval: -1 }))).toBe(true);
  });

  it('reopens a request rejected LATER, past the dept approval that would lock it', () => {
    // The case the two rules collide on. Without rejection winning, a request
    // refused by Finance is frozen: the requester cannot fix it and no approver
    // can advance it.
    const refusedByFinance = row({ dept_approval: 1, finance_approval: -1 });
    expect(isEditableState(refusedByFinance)).toBe(true);

    const refusedAtPayment = row({
      dept_approval: 1,
      finance_approval: 1,
      management_approval: 1,
      paid_approval: -1,
    });
    expect(isEditableState(refusedAtPayment)).toBe(true);
  });

  it('locks a paid request', () => {
    expect(
      isEditableState(row({ dept_approval: 1, finance_approval: 1, management_approval: 1, paid_approval: 1 })),
    ).toBe(false);
  });
});

describe('canEditRequest', () => {
  const ME = 7;
  const SOMEBODY_ELSE = 9;

  it('lets the requester edit their own editable request', () => {
    expect(canEditRequest(base, ME, ME)).toBe(true);
  });

  it('refuses everyone but the requester, however editable the state is', () => {
    // An approver who disagrees rejects with a reason; they do not rewrite the
    // request into something the requester never asked for and then approve it.
    expect(canEditRequest(base, SOMEBODY_ELSE, ME)).toBe(false);
    expect(canEditRequest(row({ finance_approval: -1 }), SOMEBODY_ELSE, ME)).toBe(false);
  });

  it('refuses a request whose author is gone — nobody inherits it', () => {
    expect(canEditRequest(base, null, ME)).toBe(false);
    expect(canEditRequest(base, undefined, ME)).toBe(false);
  });

  it('still respects the state rule for the requester', () => {
    expect(canEditRequest(row({ dept_approval: 1 }), ME, ME)).toBe(false);
  });
});

describe('willResubmitOnSave', () => {
  it('is true for a rejected request — saving the correction sends it round again', () => {
    expect(willResubmitOnSave(row({ finance_approval: -1 }))).toBe(true);
    expect(willResubmitOnSave(row({ dept_approval: -1 }))).toBe(true);
  });

  it('is false for anything already moving through the chain', () => {
    expect(willResubmitOnSave(base)).toBe(false);
    expect(willResubmitOnSave(row({ dept_approval: 1 }))).toBe(false);
    expect(
      willResubmitOnSave(row({ dept_approval: 1, finance_approval: 1, management_approval: 1, paid_approval: 1 })),
    ).toBe(false);
  });
});

describe('paymentStatus', () => {
  it('reports rejection ahead of everything else', () => {
    const r = row({ dept_approval: 1, finance_approval: 1, management_approval: 1, paid_approval: -1 });
    expect(paymentStatus(r)).toEqual({ key: 'rejected', label: 'Rejected', stage: null });
  });

  it('walks the chain one stage at a time', () => {
    expect(paymentStatus(base).stage).toBe('dept');
    expect(paymentStatus(row({ dept_approval: 1 })).stage).toBe('finance');
    expect(paymentStatus(row({ dept_approval: 1, finance_approval: 1 })).stage).toBe('management');
  });

  it('inserts Under Process for a Bank payment only', () => {
    const approved = { dept_approval: 1, finance_approval: 1, management_approval: 1 };
    expect(paymentStatus(row({ ...approved, payment_type: 'Bank' })).key).toBe('waiting_under_process');
    // Cash skips it entirely and goes straight to payment.
    expect(paymentStatus(row({ ...approved, payment_type: 'Cash' })).key).toBe('waiting_payment');
    // …and a Bank payment that HAS been processed moves on too.
    expect(paymentStatus(row({ ...approved, payment_type: 'Bank', under_process: 1 })).key).toBe('waiting_payment');
  });

  it('reports a paid request as finished, with nothing left to act on', () => {
    const r = row({ dept_approval: 1, finance_approval: 1, management_approval: 1, paid_approval: 1 });
    expect(paymentStatus(r)).toEqual({ key: 'paid', label: 'Paid', stage: null });
  });
});
