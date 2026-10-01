import { describe, it, expect } from 'vitest';
import {
  compareBoard,
  gainAtBestRate,
  formatDelta,
  formatMoney,
  formatRate,
  toRate,
  type BoardRate,
} from './exchangeRates';

// Higher wins: the rates are CDF per unit of foreign currency, and the agency
// sells that currency to get the CDF it pays duties with.

const board = (...rates: Array<[number, number | null]>): BoardRate[] =>
  rates.map(([bankId, rate]) => ({ bankId, rate }));

describe('compareBoard', () => {
  it('greens the banks above the BCC reference and only those', () => {
    const v = compareBoard(2850, board([1, 2905], [2, 2830], [3, 2870]));
    expect(v.byBank.get(1)?.beatsBcc).toBe(true);
    expect(v.byBank.get(2)?.beatsBcc).toBe(false);
    expect(v.byBank.get(3)?.beatsBcc).toBe(true);
  });

  it('marks the single highest rate as best', () => {
    const v = compareBoard(2850, board([1, 2905], [2, 2830], [3, 2870]));
    expect(v.byBank.get(1)?.best).toBe(true);
    expect(v.byBank.get(3)?.best).toBe(false);
    expect(v.bestRate).toBe(2905);
  });

  it('marks every bank sharing the top rate, not an arbitrary one', () => {
    const v = compareBoard(2800, board([1, 2905], [2, 2905], [3, 2870]));
    expect(v.byBank.get(1)?.best).toBe(true);
    expect(v.byBank.get(2)?.best).toBe(true);
    expect(v.byBank.get(3)?.best).toBe(false);
  });

  it('hands the highlight to BCC when no bank beats it', () => {
    const v = compareBoard(2950, board([1, 2905], [2, 2830]));
    expect(v.bccIsBest).toBe(true);
    expect(v.byBank.get(1)?.beatsBcc).toBe(false);
  });

  it('treats equalling the reference as not beating it', () => {
    const v = compareBoard(2900, board([1, 2900]));
    expect(v.byBank.get(1)?.beatsBcc).toBe(false);
    expect(v.bccIsBest).toBe(true);
    expect(v.byBank.get(1)?.delta).toBe(0);
  });

  it('declares no winner at all when the BCC rate is missing', () => {
    // An empty benchmark cannot be the best; claiming so would paint the board
    // green on the strength of nothing.
    const v = compareBoard(null, board([1, 2905]));
    expect(v.bccIsBest).toBe(false);
    expect(v.byBank.get(1)?.beatsBcc).toBe(false);
    expect(v.byBank.get(1)?.delta).toBeNull();
    // The best-of-board still stands — it does not depend on the reference.
    expect(v.byBank.get(1)?.best).toBe(true);
  });

  it('ignores blank and zero cells rather than reading them as a rate of nothing', () => {
    const v = compareBoard(2850, board([1, null], [2, 0], [3, 2870]));
    expect(v.byBank.get(1)?.best).toBe(false);
    expect(v.byBank.get(2)?.best).toBe(false);
    expect(v.byBank.get(3)?.best).toBe(true);
    expect(v.bestRate).toBe(2870);
  });

  it('greens nothing on an empty board', () => {
    const v = compareBoard(2850, board([1, null], [2, null]));
    expect(v.bestRate).toBeNull();
    expect(v.bccIsBest).toBe(true); // the reference is the only rate there is
    expect([...v.byBank.values()].every((r) => !r.beatsBcc && !r.best)).toBe(true);
  });

  it('reports the delta without float noise', () => {
    expect(compareBoard(2850.25, board([1, 2905.5])).byBank.get(1)?.delta).toBe(55.25);
  });

  it('gives every bank a verdict, including ones with nothing entered', () => {
    const v = compareBoard(2850, board([1, 2905], [2, null]));
    expect(v.byBank.size).toBe(2);
    expect(v.byBank.get(2)).toEqual({ beatsBcc: false, best: false, delta: null });
  });
});

describe('toRate', () => {
  it('reads the numeric(10,4) string the driver returns', () => {
    expect(toRate('2905.5000')).toBe(2905.5);
  });

  it('treats null, empty and zero as not entered', () => {
    // '0.0000' is the column default, not a rate anyone typed.
    for (const v of [null, undefined, '', '0.0000', 0]) expect(toRate(v)).toBeNull();
  });

  it('rejects junk instead of returning NaN', () => {
    expect(toRate('abc')).toBeNull();
  });
});

describe('formatting', () => {
  it('renders a rate at two decimals with separators', () => {
    expect(formatRate(2905.5)).toBe('2,905.50');
    expect(formatRate(null)).toBe('—');
  });

  it('signs the delta so the direction needs no caption', () => {
    expect(formatDelta(55.25)).toBe('+55.25');
    expect(formatDelta(-20)).toBe('−20.00');
    expect(formatDelta(0)).toBe('');
    expect(formatDelta(null)).toBe('');
  });
});

describe('formatMoney', () => {
  it('groups thousands and keeps cents', () => {
    expect(formatMoney(1234567.891)).toBe('1,234,567.89');
  });

  it('falls back for a missing figure', () => {
    expect(formatMoney(null)).toBe('—');
  });
});

describe('gainAtBestRate', () => {
  it('is the amount times the best bank rate less the BCC', () => {
    // 1,000 × (1,400 − 1,000) = 400,000.
    expect(gainAtBestRate(1000, 1400, 1000).value).toBe(400_000);
  });

  it('carries the margin back so the screen can show the arithmetic', () => {
    const g = gainAtBestRate(1000, 1400, 1000);
    expect(g.bestRate).toBe(1400);
    expect(g.bccRate).toBe(1000);
    expect(g.margin).toBe(400);
    expect(g.amount).toBe(1000);
  });

  it('keeps a NEGATIVE margin rather than clamping it to zero', () => {
    // No bank beat the BCC that day. Hiding it would suppress exactly the day
    // an operator most needs to see.
    const g = gainAtBestRate(1000, 900, 1000);
    expect(g.margin).toBe(-100);
    expect(g.value).toBe(-100_000);
  });

  it('rounds the margin to four decimals and the value to cents', () => {
    const g = gainAtBestRate(3, 1400.12345, 1000);
    expect(g.margin).toBe(400.1235);
    expect(g.value).toBe(1200.37);
  });

  it('reports nothing when the amount box is empty', () => {
    expect(gainAtBestRate('', 1400, 1000).value).toBeNull();
    expect(gainAtBestRate(null, 1400, 1000).value).toBeNull();
  });

  it('reports nothing when no bank has quoted', () => {
    expect(gainAtBestRate(1000, null, 1000).value).toBeNull();
    expect(gainAtBestRate(1000, 0, 1000).value).toBeNull();
  });

  it('reports nothing when the BCC reference is not entered', () => {
    // Without it there is no baseline, so there is no margin to state.
    expect(gainAtBestRate(1000, 1400, null).value).toBeNull();
    expect(gainAtBestRate(1000, 1400, 0).margin).toBeNull();
  });

  it('accepts zero as a real amount', () => {
    expect(gainAtBestRate(0, 1400, 1000).value).toBe(0);
  });

  it('rejects a negative amount', () => {
    expect(gainAtBestRate(-100, 1400, 1000).value).toBeNull();
  });

  it('ignores a non-numeric amount', () => {
    expect(gainAtBestRate('abc', 1400, 1000).value).toBeNull();
  });

  it('is zero when the best bank exactly matches the BCC', () => {
    const g = gainAtBestRate(5000, 1000, 1000);
    expect(g.margin).toBe(0);
    expect(g.value).toBe(0);
  });
});
