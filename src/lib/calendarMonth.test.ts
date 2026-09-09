import { describe, it, expect } from 'vitest';
import { buildMonthGrid, MONTH_NAMES, WEEKDAY_HEADINGS } from './calendarMonth';

const flat = (year: number, month: number) => buildMonthGrid(year, month).flat();
const inMonth = (year: number, month: number) => flat(year, month).filter((d) => d.inMonth);

describe('buildMonthGrid', () => {
  it('returns whole weeks of seven, Monday-first', () => {
    for (const [y, m] of [[2026, 1], [2026, 2], [2026, 6], [2024, 2], [2027, 8]] as const) {
      const weeks = buildMonthGrid(y, m);
      expect(weeks.every((w) => w.length === 7), `${y}-${m} has a short week`).toBe(true);
      // Every row starts on a Monday and ends on a Sunday.
      expect(weeks.every((w) => !w[0].weekend)).toBe(true);
      expect(weeks.every((w) => w[6].weekend)).toBe(true);
    }
  });

  it('takes a 1-based month — 12 is December, not January', () => {
    const days = inMonth(2026, 12);
    expect(days[0].iso).toBe('2026-12-01');
    expect(days[days.length - 1].iso).toBe('2026-12-31');
  });

  it('covers every day of the month exactly once, in order', () => {
    const days = inMonth(2026, 1);
    expect(days).toHaveLength(31);
    expect(days.map((d) => d.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  it.each([
    ['a common year', 2026, 28],
    ['a leap year', 2024, 29],
    ['a century leap year', 2000, 29],
    ['a century common year', 1900, 28],
  ])('gets February right in %s', (_label, year, expected) => {
    expect(inMonth(year, 2)).toHaveLength(expected);
  });

  it('pads from the neighbouring months rather than leaving holes', () => {
    // 01-02-2026 is a Sunday, so the grid leads with six days of January.
    const weeks = buildMonthGrid(2026, 2);
    const lead = weeks[0].filter((d) => !d.inMonth);
    expect(lead).toHaveLength(6);
    expect(lead[0].iso).toBe('2026-01-26');
    expect(weeks[0][6].iso).toBe('2026-02-01');
  });

  it('marks padding days as out-of-month so a neighbour holiday cannot light up twice', () => {
    // 01-03-2026 appears in the February grid as padding; it must not count as
    // February, or a 1 March holiday would render red in both months.
    const feb = flat(2026, 2).find((d) => d.iso === '2026-03-01');
    expect(feb?.inMonth).toBe(false);
    const mar = flat(2026, 3).find((d) => d.iso === '2026-03-01');
    expect(mar?.inMonth).toBe(true);
  });

  it('flags exactly Saturday and Sunday as weekend', () => {
    const days = flat(2026, 6);
    // 27-06-2026 Sat, 28-06-2026 Sun, 29-06-2026 Mon.
    expect(days.find((d) => d.iso === '2026-06-27')?.weekend).toBe(true);
    expect(days.find((d) => d.iso === '2026-06-28')?.weekend).toBe(true);
    expect(days.find((d) => d.iso === '2026-06-29')?.weekend).toBe(false);
  });

  it('emits ISO keys that match the API date format', () => {
    // Zero-padded month and day — the key the holiday lookup is built on.
    const jan = inMonth(2026, 1)[0];
    expect(jan.iso).toBe('2026-01-01');
    expect(inMonth(2026, 9)[8].iso).toBe('2026-09-09');
  });

  it('crosses a year boundary in the padding without breaking the ISO', () => {
    const weeks = buildMonthGrid(2027, 1);
    expect(weeks[0][0].iso).toBe('2026-12-28');
    expect(weeks[0][0].inMonth).toBe(false);
  });
});

describe('calendar labels', () => {
  it('heads the week on Monday', () => {
    expect(WEEKDAY_HEADINGS[0]).toBe('Mon');
    expect(WEEKDAY_HEADINGS[6]).toBe('Sun');
    expect(WEEKDAY_HEADINGS).toHaveLength(7);
  });

  it('names twelve months in order', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[0]).toBe('January');
    expect(MONTH_NAMES[11]).toBe('December');
  });
});
