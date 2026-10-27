// §4.29 — the shapes and arithmetic every comparison dashboard shares: what a
// metric is, what a compared slice carries, and how the change between two
// slices is worked out and read. Pure, so the server computes and the browser
// renders with the same definitions (§4.10).

/** How a metric's value is written. */
export type MetricFormat = 'count' | 'usd' | 'kg' | 'days' | 'pct';

/**
 * Whether a rise is good news. Decides the colour of the change, not its sign:
 * more cleared files is good, more clearance days is not, and a count of
 * licences issued is neither.
 */
export type MetricDirection = 'up' | 'down' | 'neutral';

export interface MetricDef {
  key: string;
  label: string;
  format: MetricFormat;
  better: MetricDirection;
  /** One line under the label saying exactly what is counted. */
  hint?: string;
}

export interface MonthPoint {
  /** `YYYY-MM` — the browser labels it, so the axis reads MM-YYYY (§4.19). */
  month: string;
  value: number;
}

export interface ComparedSlice {
  key: string;
  label: string;
  /** What the slice covers, e.g. "01-01-2026 – 30-09-2026". */
  detail: string;
  values: Record<string, number | null>;
  /** The headline metric month by month, over the slice's own window. */
  monthly: MonthPoint[];
}

export interface ComparisonResult {
  mode: string;
  metrics: MetricDef[];
  headline: string;
  slices: ComparedSlice[];
  /** What the pickers can offer, so the screen never guesses an id. */
  available: {
    offices: Array<{ id: number; label: string }>;
    officeLabel: string;
    directions: Array<{ key: string; label: string }>;
  };
  /** Set when the server chose the compared clients / offices itself. */
  autoPicked?: string;
}

export interface Change {
  abs: number;
  /** Null when the base is 0 — "+∞%" tells nobody anything. */
  pct: number | null;
  /** good / bad / neutral, from the metric's `better`. */
  tone: 'good' | 'bad' | 'neutral';
}

/** The change from `base` to `value`, judged by what the metric counts as better. */
export function changeOf(value: number | null, base: number | null, better: MetricDirection): Change | null {
  if (value === null || base === null) return null;
  const abs = value - base;
  const pct = base === 0 ? null : (abs / Math.abs(base)) * 100;
  const tone = abs === 0 || better === 'neutral' ? 'neutral' : (abs > 0) === (better === 'up') ? 'good' : 'bad';
  return { abs, pct, tone };
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A metric value as the operator reads it. Null is an em dash, never 0. */
export function formatMetric(value: number | null, format: MetricFormat): string {
  if (value === null || !Number.isFinite(value)) return '—';
  switch (format) {
    case 'count':
      return nf.format(value);
    case 'usd':
      return `$${nf2.format(value)}`;
    case 'kg':
      return value >= 1000 ? `${nf1.format(value / 1000)} t` : `${nf.format(value)} kg`;
    case 'days':
      return `${nf1.format(value)} d`;
    case 'pct':
      return `${nf1.format(value)}%`;
  }
}

/** "+12 (+8.5%)" / "−3 (−20.0%)" — the change column's text. */
export function formatChange(change: Change | null, format: MetricFormat): string {
  if (!change) return '—';
  if (change.abs === 0) return 'no change';
  const sign = change.abs > 0 ? '+' : '−';
  const abs = formatMetric(Math.abs(change.abs), format);
  return change.pct === null ? `${sign}${abs}` : `${sign}${abs} (${sign}${nf1.format(Math.abs(change.pct))}%)`;
}
