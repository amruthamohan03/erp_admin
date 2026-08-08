// §4.19 — the one date formatter. Everything the user reads renders day/month/year.
//
// Before this module there were twelve local `fmtDate` helpers producing five
// different formats — `DD-MM-YYYY`, `DD/MM/YYYY`, `MMM D, YYYY`, and a bare
// `toLocaleDateString()` that followed the *server or browser* locale and so showed
// `MM/DD/YYYY` on a US-configured machine. For a DRC customs operation that is not a
// cosmetic difference: 03/04 is either March or April depending on who rendered it.
//
// Formatting is deliberately NOT locale-aware. The business format is fixed, so the
// output must not change with the machine's regional settings.

/** Shown when there is no date. Matches the em-dash used elsewhere for "no value". */
export const NO_DATE = '—';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Split a value into day/month/year parts.
 *
 * A `YYYY-MM-DD` string is read textually rather than through `new Date()`: parsing
 * a date-only string yields UTC midnight, which renders as the *previous day* for
 * anyone west of Greenwich. Timestamps and Date objects go through the Date API,
 * where local-time parts are what the reader expects.
 */
function parts(value: unknown): { d: string; m: string; y: string; time?: string } | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'string') {
    const iso = ISO_DATE.exec(value);
    if (iso) {
      const [, y, m, d] = iso;
      // Keep the clock component when the string carries one (e.g. audit rows).
      const t = /[T ](\d{2}):(\d{2})/.exec(value);
      return { d, m, y, time: t ? `${t[1]}:${t[2]}` : undefined };
    }
  }

  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return null;
  return {
    d: pad(date.getDate()),
    m: pad(date.getMonth() + 1),
    y: String(date.getFullYear()),
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/** `DD/MM/YYYY`. Returns `fallback` for null/empty/unparseable input. */
export function formatDate(value: unknown, fallback: string = NO_DATE): string {
  const p = parts(value);
  return p ? `${p.d}/${p.m}/${p.y}` : fallback;
}

/** `DD/MM/YYYY HH:mm` — for timestamps (audit trails, activity feeds). */
export function formatDateTime(value: unknown, fallback: string = NO_DATE): string {
  const p = parts(value);
  if (!p) return fallback;
  return p.time ? `${p.d}/${p.m}/${p.y} ${p.time}` : `${p.d}/${p.m}/${p.y}`;
}

/**
 * `YYYY-MM-DD` for `<input type="date">`, whose value attribute is ISO by spec and
 * must never be localised. Use this when seeding a date input from stored data.
 */
export function toDateInputValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') {
    const iso = ISO_DATE.exec(value);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
