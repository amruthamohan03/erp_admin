// Server-only: maps a license dashboard-card key to the SQL condition that backs
// its count (and the matching ?card= list filter). Used by BOTH
// /api/licenses/stats and /api/licenses so a card's count and its filtered list
// (the click-through popup) always agree.
//
// The card display metadata (title/icon/colour/order) lives in
// dashboard_card_master_t; only the count/filter LOGIC lives here. Keys match the
// `card_content_id` / data_source path of each seeded card (see migration 0063).
//
// TODO(config): per §4.2 these card predicates are business logic and would
// ideally live in master_rules / the rule engine. They are kept here to mirror
// the existing import precedent (src/lib/imports/cardConditions.ts); migrate both
// together when the rule engine grows date/aggregate support.
import { eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { licenses } from '@/db/schema';

// Window (in days) a license counts as "expiring soon". Mirrors the source
// LicenseController::EXPIRING_DAYS_THRESHOLD.
export const EXPIRING_DAYS_THRESHOLD = 30;

// All card keys in display order (the stats endpoint returns a count per key).
export const LICENSE_CARD_KEYS = [
  'all',
  'expired',
  'expiring',
  'incomplete',
  'annulated',
  'modified',
  'prorogated',
] as const;

export type LicenseCardKey = (typeof LICENSE_CARD_KEYS)[number];

/**
 * SQL condition for a card key, or null for 'all' / unknown keys (no extra
 * filter beyond the always-on display = 'Y').
 *
 * "incomplete" mirrors the source getIncompleteConditions(): a license missing
 * any core field. It is deliberately kind-agnostic (no MCA/special branching) —
 * it is an attention bucket, not a hard validation gate (presence is enforced
 * per-accordion at save time, §4.12).
 */
export function cardCondition(key: string): SQL | null {
  switch (key) {
    case 'expired':
      return sql`${licenses.licenseExpiryDate} < CURRENT_DATE`;
    case 'expiring':
      return sql`${licenses.licenseExpiryDate} >= CURRENT_DATE AND ${licenses.licenseExpiryDate} <= CURRENT_DATE + INTERVAL '${sql.raw(String(EXPIRING_DAYS_THRESHOLD))} days'`;
    case 'annulated':
      return eq(licenses.status, 'ANNULATED');
    case 'modified':
      return eq(licenses.status, 'MODIFIED');
    case 'prorogated':
      return eq(licenses.status, 'PROROGATED');
    case 'incomplete':
      return or(
        isNull(licenses.clientId),
        isNull(licenses.bankId),
        isNull(licenses.typeOfGoodsId),
        isNull(licenses.transportModeId),
        isNull(licenses.currencyId),
        isNull(licenses.fobDeclared),
        isNull(licenses.licenseValidationDate),
        isNull(licenses.licenseExpiryDate),
        sql`(${licenses.licenseNumber} IS NULL OR ${licenses.licenseNumber} = '')`,
      ) as SQL;
    case 'all':
    default:
      return null;
  }
}
