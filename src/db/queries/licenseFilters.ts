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

export type LicenseCardKey =
  | 'expired'
  | 'issued'
  | 'approved'
  | 'pending'
  | 'cancelled'
  | 'expiring_soon';

/**
 * The predicate behind each dashboard card. Clicking a card filters the list to
 * exactly the rows its number counted (§4.29), which only holds while both read
 * from here.
 */
export function licenseCardCondition(card: string): SQL | undefined {
  switch (card) {
    case 'expired':
      return IS_EXPIRED;
    // Excludes the expired ones. Counting them as Issued was the same bug the
    // badge had: "live licences" that had lapsed months ago.
    case 'issued':
      return IS_LIVE;
    case 'approved':
      return sql`${licenseT.status} = 'MODIFIED'`;
    case 'pending':
      return sql`${licenseT.status} = 'INACTIVE'`;
    case 'cancelled':
      return sql`${licenseT.status} = 'ANNULATED'`;
    // Still in date, but not for long — disjoint from `expired` by construction.
    case 'expiring_soon':
      return sql`(
        ${licenseT.status} = 'ACTIVE'
        AND ${licenseT.licenseExpiryDate} IS NOT NULL
        AND ${licenseT.licenseExpiryDate} BETWEEN current_date AND current_date + interval '30 days'
      )`;
    default:
      return undefined;
  }
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
