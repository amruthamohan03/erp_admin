import { describe, expect, it } from 'vitest';
import { NO_DATE, formatDate, formatDateTime, toDateInputValue } from './formatDate';

// Every user-visible date in the app goes through these (§4.19), so a regression
// here silently changes what an operator reads on an invoice or a licence.

describe('formatDate', () => {
  it('renders day-month-year', () => {
    expect(formatDate('2026-08-03')).toBe('03-08-2026');
  });

  it('does not shift the day across timezones for a date-only string', () => {
    // `new Date('2026-01-01')` is UTC midnight, which is 31-12 for anyone west of
    // Greenwich. Reading the string textually is what keeps this stable.
    expect(formatDate('2026-01-01')).toBe('01-01-2026');
    expect(formatDate('2026-12-31')).toBe('31-12-2026');
  });

  it('handles ISO timestamps and Date objects', () => {
    expect(formatDate('2026-08-03T14:30:00Z')).toBe('03-08-2026');
    expect(formatDate(new Date(2026, 7, 3))).toBe('03-08-2026');
  });

  it('pads single-digit days and months', () => {
    expect(formatDate('2026-01-05')).toBe('05-01-2026');
  });

  it('returns the fallback for empty and unparseable input', () => {
    expect(formatDate(null)).toBe(NO_DATE);
    expect(formatDate(undefined)).toBe(NO_DATE);
    expect(formatDate('')).toBe(NO_DATE);
    expect(formatDate('not a date')).toBe(NO_DATE);
    expect(formatDate(null, '')).toBe('');
  });

  it('is not locale-dependent — the business format is fixed', () => {
    // A US-locale machine would render 08/03/2026 via toLocaleDateString.
    expect(formatDate('2026-08-03')).not.toBe('08-03-2026');
  });
});

describe('formatDateTime', () => {
  it('appends the clock when the value carries one', () => {
    expect(formatDateTime('2026-08-03T14:30:00Z')).toBe('03-08-2026 14:30');
    expect(formatDateTime('2026-08-03 09:05:12')).toBe('03-08-2026 09:05');
  });

  it('omits the clock for a date-only value', () => {
    expect(formatDateTime('2026-08-03')).toBe('03-08-2026');
  });

  it('falls back like formatDate', () => {
    expect(formatDateTime(null)).toBe(NO_DATE);
  });
});

describe('toDateInputValue', () => {
  it('keeps the ISO shape <input type="date"> requires', () => {
    expect(toDateInputValue('2026-08-03T14:30:00Z')).toBe('2026-08-03');
    expect(toDateInputValue('2026-08-03')).toBe('2026-08-03');
    expect(toDateInputValue(new Date(2026, 7, 3))).toBe('2026-08-03');
  });

  it('returns an empty string for no value, so the input renders blank', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue('')).toBe('');
    expect(toDateInputValue('nonsense')).toBe('');
  });
});
