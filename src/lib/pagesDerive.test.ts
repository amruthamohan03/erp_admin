import { describe, it, expect } from 'vitest';
import { computePureDerive, isPureDerive, parseDerive } from './pages/derive';

// `sumJson` backs the payment request's header Amount: it is the sum of the
// mca_data reference lines rather than a hand-typed number, computed on the
// client and re-enforced by the save route so the two cannot drift.

const AMOUNT_DERIVE = {
  kind: 'sumJson' as const,
  field: 'mca_data',
  amountKey: 'amount',
};

describe('sumJson derive', () => {
  it('is pure, so the server recomputes it on save', () => {
    expect(isPureDerive(AMOUNT_DERIVE)).toBe(true);
  });

  it('totals the amount key across the rows', () => {
    const values = {
      mca_data: [
        { mca_ref: 'ABC-1', amount: 1200.5 },
        { mca_ref: 'ABC-2', amount: 800.25 },
      ],
    };
    expect(computePureDerive(AMOUNT_DERIVE, values)).toBe(2000.75);
  });

  it('rounds to two decimals rather than leaking float error', () => {
    const values = { mca_data: [{ amount: 0.1 }, { amount: 0.2 }] };
    expect(computePureDerive(AMOUNT_DERIVE, values)).toBe(0.3);
  });

  it('accepts the JSON string form a form may submit', () => {
    const values = { mca_data: '[{"mca_ref":"A","amount":10},{"mca_ref":"B","amount":5}]' };
    expect(computePureDerive(AMOUNT_DERIVE, values)).toBe(15);
  });

  it('treats missing and non-numeric amounts as zero', () => {
    const values = { mca_data: [{ amount: 10 }, {}, { amount: 'abc' }] };
    expect(computePureDerive(AMOUNT_DERIVE, values)).toBe(10);
  });

  // Returning undefined leaves the field untouched. Forcing 0 would blank a
  // stored amount whenever the grid had not loaded yet.
  it('leaves the field alone when there are no rows', () => {
    expect(computePureDerive(AMOUNT_DERIVE, { mca_data: [] })).toBeUndefined();
    expect(computePureDerive(AMOUNT_DERIVE, {})).toBeUndefined();
    expect(computePureDerive(AMOUNT_DERIVE, { mca_data: null })).toBeUndefined();
    expect(computePureDerive(AMOUNT_DERIVE, { mca_data: 'not json' })).toBeUndefined();
  });

  it('round-trips through parseDerive, the way the config column is read', () => {
    const spec = parseDerive(JSON.parse(JSON.stringify(AMOUNT_DERIVE)));
    expect(computePureDerive(spec, { mca_data: [{ amount: 7 }] })).toBe(7);
  });
});
