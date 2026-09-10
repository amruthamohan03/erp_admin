// Month-grid arithmetic for calendar views. Pure and UTC-only, so it can be
// unit-tested and cannot drift a day with the machine's timezone (§4.19).
//
// A calendar cell is a CALENDAR DAY, not an instant. Every date here is built
// and read through `Date.UTC` / `getUTC*` for the same reason `formatDate` reads
// an ISO string textually: `new Date('2026-01-01')` is UTC midnight, which is
// the previous day west of Greenwich.

/** Monday-first: the DRC is francophone, and the whole app reads day-first. */
export const WEEKDAY_HEADINGS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export interface CalendarDay {
  /** `YYYY-MM-DD`, the key every caller matches its own data on. */
  iso: string;
  /** Day of the month, 1–31. */
  day: number;
  /**
   * False for the leading/trailing days that pad the grid to whole weeks.
   * Rendered faintly, and never treated as belonging to the month — a holiday
   * on 1 March must not also light up in the February grid.
   */
  inMonth: boolean;
  /** Saturday or Sunday — already a non-working day. */
  weekend: boolean;
}

const pad = (n: number): string => String(n).padStart(2, '0');

const isoOf = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Monday = 0 … Sunday = 6, from JS's Sunday = 0. */
const mondayIndex = (jsDay: number): number => (jsDay + 6) % 7;

/**
 * One month as whole weeks of seven days, Monday-first, padded from the
 * neighbouring months so every row is complete.
 *
 * @param year  four-digit year
 * @param month 1–12 (calendar month, not JS's 0-based one — the off-by-one that
 *              makes a December grid render January)
 */
export function buildMonthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // Day 0 of the NEXT month is the last day of this one — avoids a leap-year
  // table, and gets 29 February right for free.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = mondayIndex(first.getUTCDay());

  // Whole weeks covering the lead padding plus every day of the month.
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells; i += 1) {
    const d = new Date(Date.UTC(year, month - 1, 1 - lead + i));
    const dow = d.getUTCDay();
    const cell: CalendarDay = {
      iso: isoOf(d),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1 && d.getUTCFullYear() === year,
      weekend: dow === 0 || dow === 6,
    };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }
  return weeks;
}

/**
 * How many Saturdays and Sundays a year holds.
 *
 * Weekends are non-working days everywhere it counts — `makeWorkingDays` skips
 * them before it ever looks at the holiday set — so they are not rows in
 * `drc_holidays_t` and cannot be counted from it. The calendar still has to
 * state the real total, or "9 holidays in 2026" reads as the year's whole
 * non-working count when it is a fraction of it.
 */
export function weekendDaysInYear(year: number): number {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  let n = 0;
  for (let t = start; t < end; t += 86_400_000) {
    const dow = new Date(t).getUTCDay();
    if (dow === 0 || dow === 6) n += 1;
  }
  return n;
}

/** Today as `YYYY-MM-DD` in the viewer's own timezone — for the "today" ring. */
export function todayLocalIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}
