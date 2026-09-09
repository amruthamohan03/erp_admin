import { describe, it, expect } from 'vitest';
import { drcHolidayCreateSchema, drcHolidayUpdateSchema, drcHolidayListQuerySchema } from './drc-holidays';
import { isWeekend, weekdayName, formatDate } from '@/lib/formatDate';

describe('drcHolidayCreateSchema', () => {
  it('accepts a holiday with both names', () => {
    const parsed = drcHolidayCreateSchema.parse({
      holiday_date: '2026-06-30',
      name_en: 'Independence Day',
      name_fr: "Fete de l'Independance",
      holiday_type: 'fixed',
    });
    expect(parsed.holiday_date).toBe('2026-06-30');
    expect(parsed.holiday_type).toBe('fixed');
  });

  it('defaults the type to fixed — most DRC holidays are the same date each year', () => {
    const parsed = drcHolidayCreateSchema.parse({ holiday_date: '2026-01-01', name_en: 'New Year' });
    expect(parsed.holiday_type).toBe('fixed');
  });

  it('allows the French name to be absent rather than forcing a retyped English one', () => {
    expect(() =>
      drcHolidayCreateSchema.parse({ holiday_date: '2026-01-04', name_en: 'Martyrs Day' }),
    ).not.toThrow();
  });

  it.each([
    ['a display-format date', '30-06-2026'],
    ['a slashed date', '2026/06/30'],
    ['a timestamp', '2026-06-30T00:00:00Z'],
    ['nonsense', 'soon'],
  ])('rejects %s — the wire format is ISO (§4.19)', (_label, value) => {
    const r = drcHolidayCreateSchema.safeParse({ holiday_date: value, name_en: 'X' });
    expect(r.success).toBe(false);
  });

  it('names the field when the English name is missing (§4.23)', () => {
    const r = drcHolidayCreateSchema.safeParse({ holiday_date: '2026-06-30', name_en: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message).join(' ')).toContain('Name (English) is required');
    }
  });

  it('rejects a type outside the two the KPI understands', () => {
    const r = drcHolidayCreateSchema.safeParse({
      holiday_date: '2026-06-30',
      name_en: 'X',
      holiday_type: 'movable',
    });
    expect(r.success).toBe(false);
  });
});

describe('drcHolidayUpdateSchema', () => {
  it('allows a partial patch — every field is optional', () => {
    expect(drcHolidayUpdateSchema.parse({ name_fr: 'Noel' })).toEqual({ name_fr: 'Noel' });
  });

  it('carries the soft-delete flag (§4.27)', () => {
    expect(drcHolidayUpdateSchema.parse({ display: 'N' }).display).toBe('N');
  });
});

describe('drcHolidayListQuerySchema', () => {
  it('coerces the year and paging from query strings', () => {
    const q = drcHolidayListQuerySchema.parse({ year: '2026', page: '2', pageSize: '50' });
    expect(q).toMatchObject({ year: 2026, page: 2, pageSize: 50 });
  });

  it('defaults paging when the caller supplies none', () => {
    const q = drcHolidayListQuerySchema.parse({});
    expect(q).toMatchObject({ page: 1, pageSize: 20 });
  });

  it('refuses an implausible year rather than scanning for it', () => {
    expect(drcHolidayListQuerySchema.safeParse({ year: '1200' }).success).toBe(false);
  });
});

/**
 * The holiday screen reads a calendar day, not an instant. These pin the rule
 * that has already produced two bugs in this codebase (§4.19): `new Date('...')`
 * on a bare ISO date is UTC midnight, which is the PREVIOUS day west of
 * Greenwich — so a local-time read reports the wrong weekday for anyone in the
 * Americas, and the "already a non-working day" hint would fire on the wrong row.
 */
describe('calendar-day helpers are timezone-stable', () => {
  it('reads the weekday in UTC', () => {
    // 30-06-2026 is a Tuesday.
    expect(weekdayName('2026-06-30')).toBe('Tuesday');
    // 01-01-2026 is a Thursday.
    expect(weekdayName('2026-01-01')).toBe('Thursday');
  });

  it('detects a weekend on both ends', () => {
    expect(isWeekend('2026-06-27')).toBe(true); // Saturday
    expect(isWeekend('2026-06-28')).toBe(true); // Sunday
    expect(isWeekend('2026-06-29')).toBe(false); // Monday
  });

  it('is unfazed by a value that already carries a time', () => {
    expect(weekdayName('2026-06-30T23:30:00Z')).toBe('Tuesday');
  });

  it('returns the fallback for a missing or unparseable date', () => {
    expect(weekdayName(null)).toBe('');
    expect(weekdayName('', 'n/a')).toBe('n/a');
    expect(isWeekend(null)).toBe(false);
  });

  it('renders the same day the weekday describes (§4.19)', () => {
    expect(formatDate('2026-06-30')).toBe('30-06-2026');
  });
});
