// §4.29 — how long open consignments have been sitting, for the tracking
// dashboards.
//
// Deliberately CALENDAR days, and deliberately not an SLA.
//
// /imkpi and /exkpi already own threshold analysis, and they measure in WORKING
// days (Mon–Fri minus DRC holidays) against a per-stage target. Repeating that
// here with a calendar-day count would put two numbers called "days" on two
// screens, disagreeing by every weekend in the span — the drift §4.10 exists to
// stop. So the dashboard answers the factual question, "how long has this been
// open", and links to the delay KPI screen for "is that too long".
//
// The buckets are a reading aid, not a rule: nothing is approved, flagged or
// escalated by which one a file lands in. A real overdue flag needs a business
// threshold, and that belongs in a master table (§4.1), not here.

export interface AgeingBucket {
  key: string;
  label: string;
  /** Inclusive lower bound in days. */
  min: number;
  /** Inclusive upper bound, or null for the open-ended final bucket. */
  max: number | null;
}

/** Disjoint and exhaustive over days >= 0 — every open file lands in exactly one. */
export const AGEING_BUCKETS: readonly AgeingBucket[] = [
  { key: '0_7', label: '0–7 days', min: 0, max: 7 },
  { key: '8_30', label: '8–30 days', min: 8, max: 30 },
  { key: '31_60', label: '31–60 days', min: 31, max: 60 },
  { key: '61_90', label: '61–90 days', min: 61, max: 90 },
  { key: 'over_90', label: 'Over 90 days', min: 91, max: null },
];

/**
 * The bucket a given age falls in.
 *
 * A negative age is a data problem, not a young file — an anchor date in the
 * future means somebody typed the wrong year — so it reads as the youngest
 * bucket rather than falling through to `null` and vanishing from the chart.
 */
export function ageingBucket(days: number): AgeingBucket {
  const age = Math.max(0, Math.floor(days));
  for (const bucket of AGEING_BUCKETS) {
    if (bucket.max === null || age <= bucket.max) return bucket;
  }
  // Unreachable while the last bucket is open-ended, but returning the oldest
  // is the right answer if that ever changes.
  return AGEING_BUCKETS[AGEING_BUCKETS.length - 1];
}

/** Whole days between two dates, ignoring any clock component. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}
