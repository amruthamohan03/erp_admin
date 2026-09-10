// Which rate on the daily board is the better one.
//
// The rates are CDF per one unit of the selected currency, and the agency SELLS
// that currency to obtain the CDF it settles DGDA duties with — so a higher
// number is more CDF for the same money, and higher wins. That direction is the
// whole rule; it lives here rather than in the page so it is stated once, tested
// directly, and cannot end up reversed on a second screen (§4.10).
//
// `bcc_rate` is the Banque Centrale du Congo's published reference for the day.
// It is the benchmark, not a competitor: a bank is worth using when it beats it.

/** One bank's entry on the board. `rate` is null until somebody types one. */
export interface BoardRate {
  bankId: number;
  rate: number | null;
}

export interface RateVerdict {
  /** Strictly better than the BCC reference — the green cell. */
  beatsBcc: boolean;
  /** The best rate on the board. Ties are all marked; one of them is not "the" best. */
  best: boolean;
  /** Bank rate − BCC rate. Null when either side is missing, so nothing is implied. */
  delta: number | null;
}

export interface BoardVerdict {
  byBank: Map<number, RateVerdict>;
  /**
   * No bank beat the reference, so the BCC cell is the one to highlight.
   * False when there is no BCC rate to compare against — an empty board has no
   * winner, and painting it green would claim otherwise.
   */
  bccIsBest: boolean;
  /** The highest bank rate entered, for the summary line. */
  bestRate: number | null;
}

/** A usable rate. Zero means "not entered" here — the column defaults to 0.0000. */
function usable(v: number | null): v is number {
  return v !== null && Number.isFinite(v) && v > 0;
}

export function compareBoard(bcc: number | null, rates: readonly BoardRate[]): BoardVerdict {
  const entered = rates.filter((r) => usable(r.rate)) as Array<{ bankId: number; rate: number }>;
  const bestRate = entered.length > 0 ? Math.max(...entered.map((r) => r.rate)) : null;
  const reference = usable(bcc) ? bcc : null;

  const byBank = new Map<number, RateVerdict>();
  for (const r of rates) {
    const rate = usable(r.rate) ? r.rate : null;
    byBank.set(r.bankId, {
      beatsBcc: rate !== null && reference !== null && rate > reference,
      // Every bank sharing the maximum is marked. Picking one arbitrarily would
      // tell an operator the other bank is worse when the two are identical.
      best: rate !== null && bestRate !== null && rate === bestRate,
      delta: rate !== null && reference !== null ? round4(rate - reference) : null,
    });
  }

  return {
    byBank,
    bccIsBest: reference !== null && (bestRate === null || bestRate <= reference),
    bestRate,
  };
}

/** Kill the float noise `2905.5 - 2850.25` leaves behind before it reaches a cell. */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** `numeric(10,4)` arrives from the driver as a string; '' and null are "not entered". */
export function toRate(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Two decimals with thousands separators — how an operator reads a CDF rate. */
export function formatRate(v: number | null, fallback = '—'): string {
  if (v === null) return fallback;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A signed delta, so `+55.00` reads as an improvement without further explanation. */
export function formatDelta(v: number | null): string {
  if (v === null || v === 0) return '';
  const sign = v > 0 ? '+' : '−';
  return `${sign}${formatRate(Math.abs(v))}`;
}
