import { describe, it, expect } from 'vitest';
import {
  SEAL_UNIT_PRICE,
  SEAL_STATUSES,
  computeTotalSeal,
} from './seals';

describe('SEAL_UNIT_PRICE', () => {
  it('is a positive integer (callers divide by it)', () => {
    expect(SEAL_UNIT_PRICE).toBeGreaterThan(0);
    expect(Number.isInteger(SEAL_UNIT_PRICE)).toBe(true);
  });
});

describe('SEAL_STATUSES', () => {
  it('matches the CHECK constraint in seal_number_t', () => {
    expect(SEAL_STATUSES).toEqual(['Available', 'Used', 'Damaged']);
  });
});

describe('computeTotalSeal', () => {
  it('returns floor(total / unit_price) for a positive amount', () => {
    expect(computeTotalSeal(100)).toBe(10);
    expect(computeTotalSeal(105)).toBe(10);
    expect(computeTotalSeal(109)).toBe(10);
    expect(computeTotalSeal(110)).toBe(11);
  });

  it('handles an exact multiple', () => {
    expect(computeTotalSeal(50)).toBe(5);
    expect(computeTotalSeal(SEAL_UNIT_PRICE)).toBe(1);
  });

  it('returns 0 for a zero amount (empty batch)', () => {
    expect(computeTotalSeal(0)).toBe(0);
  });

  it('returns 0 for a negative amount (defensive)', () => {
    expect(computeTotalSeal(-50)).toBe(0);
  });

  it('returns 0 for NaN / Infinity', () => {
    expect(computeTotalSeal(NaN)).toBe(0);
    expect(computeTotalSeal(Infinity)).toBe(0);
    expect(computeTotalSeal(-Infinity)).toBe(0);
  });

  it('returns 0 for an amount smaller than one seal', () => {
    expect(computeTotalSeal(SEAL_UNIT_PRICE - 1)).toBe(0);
    expect(computeTotalSeal(0.5)).toBe(0);
  });
});
