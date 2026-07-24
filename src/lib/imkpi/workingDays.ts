// Working-day counter: days from `from` (exclusive) to `to` (inclusive),
// excluding weekends and the supplied DRC holiday set. Mirrors main's
// ImkpiController::workingDays. Returns null when the span is unmeasurable
// (missing/invalid dates or to < from), 0 for a same-day span.
//
// All arithmetic is in UTC so a 'YYYY-MM-DD' string maps to a stable calendar
// day regardless of server timezone.

const DAY_MS = 86_400_000;

function isValidDateStr(d: string | null | undefined): d is string {
  return !!d && d !== '' && d !== '0000-00-00';
}

export function makeWorkingDays(holidays: Set<string>): (from: string | null, to: string | null) => number | null {
  return (from, to) => {
    if (!isValidDateStr(from) || !isValidDateStr(to)) return null;
    const f = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
    const t = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(f) || Number.isNaN(t) || t < f) return null;
    const diff = Math.floor((t - f) / DAY_MS);
    if (diff <= 0) return 0;

    let count = 0;
    for (let d = 1; d <= diff; d++) {
      const day = new Date(f + d * DAY_MS);
      const dow = day.getUTCDay(); // 0=Sun … 6=Sat
      if (dow === 0 || dow === 6) continue;
      if (holidays.has(day.toISOString().slice(0, 10))) continue;
      count++;
    }
    return count;
  };
}

// Calendar-day span (inclusive of the end), for the "Total Days" display.
export function calendarDays(from: string | null, to: string | null): number | null {
  if (!isValidDateStr(from) || !isValidDateStr(to)) return null;
  const f = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const t = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(f) || Number.isNaN(t) || t < f) return null;
  return Math.floor((t - f) / DAY_MS);
}

export { isValidDateStr };
