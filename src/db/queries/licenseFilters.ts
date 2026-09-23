// §2.2 License dashboard — the ONE definition of what a licence's status IS and
// of every status-filter predicate, shared by the list query, the card filters
// and the statistics counters so the three can never disagree (mirrors
// importFilters / exportFilters).
import { sql, type SQL } from 'drizzle-orm';
import { licenseT } from '@/db/schema';

/**
 * EXPIRED is DERIVED, never stored.
 *
 * `license_t.status` records the administrative state an operator set — ACTIVE,
 * INACTIVE, ANNULATED, MODIFIED, PROROGATED. Expiry is not one of those: it is a
 * date passing, and nobody presses a button when it does. So a licence stayed
 * ACTIVE forever, and the list showed a live badge on a licence that had lapsed.
 *
 * Computed on read rather than flipped by a nightly job. There is no scheduler in
 * this app, and adding one would leave the answer wrong for up to a day and wrong
 * again for any row the job missed — while the truth is a pure function of a date
 * that Postgres can evaluate for free. The stored column keeps its own meaning
 * and is never rewritten, so an operator's ANNULATED still reads ANNULATED after
 * the expiry date rather than being overwritten by the passage of time.
 *
 * Only an ACTIVE licence can expire. A cancelled or draft one is already
 * something more specific, and "EXPIRED" would say less than the status it has.
 */
export const IS_EXPIRED: SQL = sql`(
  ${licenseT.status} = 'ACTIVE'
  AND ${licenseT.licenseExpiryDate} IS NOT NULL
  AND ${licenseT.licenseExpiryDate} < current_date
)`;

/** What the badge shows: the stored status, or EXPIRED once the date has passed. */
export const EFFECTIVE_STATUS = sql<string>`CASE WHEN ${IS_EXPIRED} THEN 'EXPIRED' ELSE ${licenseT.status} END`;

/** ACTIVE and still in date — what "Issued" is meant to count. */
export const IS_LIVE: SQL = sql`(${licenseT.status} = 'ACTIVE' AND NOT ${IS_EXPIRED})`;

/** How long before expiry a licence starts warning. One place, so the card, the
 *  list filter and the export's orange rows cannot disagree about "soon". */
export const EXPIRING_WINDOW_DAYS = 30;

export const IS_EXPIRING: SQL = sql`(
  ${licenseT.status} = 'ACTIVE'
  AND ${licenseT.licenseExpiryDate} IS NOT NULL
  AND ${licenseT.licenseExpiryDate} BETWEEN current_date
      AND current_date + (${EXPIRING_WINDOW_DAYS} || ' days')::interval
)`;

/**
 * The card buckets.
 *
 * These are the ADMINISTRATIVE states an operator sets (ANNULATED, MODIFIED,
 * PROROGATED) plus the two DERIVED ones that are a date passing rather than a
 * decision (expired, expiring).
 *
 * The four they replaced were misnamed rather than merely unwanted, which is
 * worth recording because the names were actively misleading:
 *   * `issued`    counted ACTIVE-and-in-date — that is "active", not "issued";
 *   * `approved`  counted MODIFIED — nothing to do with approval;
 *   * `cancelled` counted ANNULATED — the French term the rest of the screen
 *                 uses, so two words for one state;
 *   * `pending`   counted INACTIVE, a draft state the cards no longer surface.
 */
export type LicenseCardKey =
  | 'total'
  | 'expired'
  | 'expiring'
  | 'active'
  | 'annulated'
  | 'modified'
  | 'prorogated';

/**
 * The predicate behind each dashboard card. Clicking a card filters the list to
 * exactly the rows its number counted (§4.29), which only holds while both read
 * from here.
 */
export function licenseCardCondition(card: string): SQL | undefined {
  switch (card) {
    case 'expired':
      return IS_EXPIRED;
    // Excludes the expired ones — a licence that lapsed months ago is not
    // "active", whatever its stored status still says.
    case 'active':
      return IS_LIVE;
    // Still in date, but not for long — disjoint from `expired` by construction.
    case 'expiring':
      return IS_EXPIRING;
    case 'annulated':
      return sql`${licenseT.status} = 'ANNULATED'`;
    case 'modified':
      return sql`${licenseT.status} = 'MODIFIED'`;
    case 'prorogated':
      return sql`${licenseT.status} = 'PROROGATED'`;
    // 'total' adds nothing: every live licence counts, so the card is the
    // unfiltered list and must not narrow it.
    default:
      return undefined;
  }
}

/**
 * What the badge would say for a raw row — the JS twin of EFFECTIVE_STATUS.
 *
 * Needed wherever a licence is rendered outside a query that could compute it in
 * SQL: the Excel export selects plain columns, and printing the stored ACTIVE on
 * a licence that lapsed last month would contradict the red the same row is
 * shaded.
 */
export function effectiveStatusOf(raw: Record<string, unknown>): string {
  const status = String(raw.status ?? '').toUpperCase();
  if (status !== 'ACTIVE') return status;
  const expiry = raw.license_expiry_date;
  if (expiry === null || expiry === undefined || expiry === '') return status;
  const day = expiry instanceof Date ? expiry : new Date(String(expiry));
  if (Number.isNaN(day.getTime())) return status;
  return daysUntil(day) < 0 ? 'EXPIRED' : status;
}

/** Whole calendar days from today to `day`; negative once it has passed. */
function daysUntil(day: Date): number {
  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(day) - startOfDay(new Date())) / 86_400_000);
}

/**
 * A licence's traffic-light state, in JavaScript, over a raw database row.
 *
 * The JS twin of IS_EXPIRED / IS_EXPIRING / IS_LIVE above, and it lives beside
 * them on purpose: the Excel export paints its rows with this while the screen
 * colours its badges from the SQL, and "expiring" has to mean the same 30 days
 * in both. Two definitions in two files is how a sheet ends up orange on rows
 * the screen calls green.
 *
 * Returns null for a licence with no state worth flagging — an INACTIVE draft
 * or a licence with no expiry date is not good news or bad news, and painting
 * every row would leave nothing standing out.
 */
export function licenseRowTone(
  raw: Record<string, unknown>,
): 'danger' | 'warning' | 'success' | null {
  const status = String(raw.status ?? '').toUpperCase();
  if (status === 'ANNULATED') return 'danger';
  if (status !== 'ACTIVE') return null;

  const expiry = raw.license_expiry_date;
  if (expiry === null || expiry === undefined || expiry === '') return 'success';

  // Compared as calendar days, not instants: a `date` column has no time, and
  // a licence expiring today is not expired (the SQL uses `< current_date`).
  const day = expiry instanceof Date ? expiry : new Date(String(expiry));
  if (Number.isNaN(day.getTime())) return 'success';

  const daysLeft = daysUntil(day);
  if (daysLeft < 0) return 'danger';
  if (daysLeft <= EXPIRING_WINDOW_DAYS) return 'warning';
  return 'success';
}

/**
 * The Status filter's predicate. EXPIRED is accepted as a status even though no
 * row stores it — an operator filtering by what the badge says must get what the
 * badge says, and ACTIVE means "active now", not "active at some point".
 */
export function licenseStatusCondition(status: string): SQL {
  const s = status.trim().toUpperCase();
  if (s === 'EXPIRED') return IS_EXPIRED;
  if (s === 'ACTIVE') return IS_LIVE;
  return sql`${licenseT.status} = ${s}`;
}

/**
 * Which side of the business a licence serves.
 *
 * The discriminator is the KIND's flag, never an id list and never the kind's
 * name (§4.1) — migration 0062 replaced a `kind_name ILIKE 'EXPORT%'` filter
 * with these columns precisely so renaming a kind could not silently reclassify
 * it. Re-flagging a kind is then a master edit on /masters/kinds, not a deploy.
 *
 * IMPORT TEMPORARY is flagged for BOTH by design: a temporary import leaves
 * again as a re-export, so it legitimately appears under each direction.
 */
export type LicenseUseFor = 'import' | 'export';

/**
 * Written as a subquery rather than a join so every caller can use it —
 * the stats and dashboard aggregates read `license_t` alone, and requiring a
 * join would have meant a second, drifting definition for them (§4.10).
 *
 * A licence with NO kind matches neither direction: it cannot be classified,
 * and a reference built from it would be missing its kind code anyway (§4.33).
 */
export function licenseUseForCondition(useFor: LicenseUseFor): SQL {
  const column = useFor === 'import' ? 'use_for_import' : 'use_for_export';
  return sql`${licenseT.kindId} IN (
    SELECT id FROM kind_master_t WHERE ${sql.identifier(column)} IS TRUE)`;
}
