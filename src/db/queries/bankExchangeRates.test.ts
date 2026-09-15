import { describe, it, expect } from 'vitest';
import { highestQuote, rateDifference, round4 } from './bankExchangeRates';

// The two rules the board is built on. Both came out of main's controller, and
// both have an edge case that matters more than the happy path.

describe('highestQuote', () => {
  it('picks the largest quote and the bank holding it', () => {
    expect(highestQuote([
      { bank_id: 1, bank_rate: 2850 },
      { bank_id: 5, bank_rate: 2910 },
      { bank_id: 7, bank_rate: 2880 },
    ])).toEqual({ bank_id: 5, rate: 2910 });
  });

  it('keeps the FIRST bank when two quote the same rate', () => {
    // Strictly-greater, so re-saving an unchanged board cannot move the green
    // highlight between two banks quoting identically.
    expect(highestQuote([
      { bank_id: 3, bank_rate: 2900 },
      { bank_id: 9, bank_rate: 2900 },
    ])).toEqual({ bank_id: 3, rate: 2900 });
  });

  it('ignores blanks and zeroes rather than calling zero the best rate', () => {
    // A bank left empty is "no quote", not a quote of nothing.
    expect(highestQuote([
      { bank_id: 1, bank_rate: 0 },
      { bank_id: 2, bank_rate: Number.NaN },
      { bank_id: 3, bank_rate: 2750 },
    ])).toEqual({ bank_id: 3, rate: 2750 });
  });

  it('reports bank 0 when nothing was quoted', () => {
    // main's sentinel — the stored column has always meant this.
    expect(highestQuote([])).toEqual({ bank_id: 0, rate: 0 });
    expect(highestQuote([{ bank_id: 4, bank_rate: 0 }])).toEqual({ bank_id: 0, rate: 0 });
  });

  it('never returns a negative rate as the winner', () => {
    expect(highestQuote([{ bank_id: 1, bank_rate: -5 }])).toEqual({ bank_id: 0, rate: 0 });
  });
});

describe('rateDifference', () => {
  it('is the gap above the previous BCC', () => {
    expect(rateDifference(2910, 2880)).toBe(30);
  });

  it('is negative when the best bank is below the previous BCC', () => {
    expect(rateDifference(2850, 2880)).toBe(-30);
  });

  it('is zero when there is no previous BCC', () => {
    // Not "highest - 0". With nothing to compare against, a difference the size
    // of the whole rate would be reported as a spike.
    expect(rateDifference(2910, 0)).toBe(0);
  });

  it('rounds to the 4 decimals the column stores', () => {
    expect(rateDifference(2910.00005, 2880)).toBe(30.0001);
    expect(round4(1 / 3)).toBe(0.3333);
  });
});
