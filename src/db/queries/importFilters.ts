// §8 Import dashboard — the ONE definition of every status filter predicate,
// shared by the list query and the statistics counters (the doc's C-01 / Q-01
// fix: five drifting copies collapsed to a single source of truth). Each key maps
// to a Drizzle `SQL` predicate over `imports_t`; clearing-status keys resolve the
// master id by text (master-driven, not a hardcoded id — §4.1).
import { sql, type SQL } from 'drizzle-orm';
import { importT } from '@/db/schema';
import { CLEARING_STATUS, clearingStatusIs } from './clearingStatus';

export type ImportFilterKey =
  | 'completed'
  | 'in_progress'
  | 'in_transit'
  | 'crf_missing'
  | 'ad_missing'
  | 'insurance_missing'
  | 'audited_pending'
  | 'archived_pending'
  | 'dgda_in_pending'
  | 'liquidation_pending'
  | 'quittance_pending'
  | 'dgda_out_pending'
  | 'dispatch_deliver_pending';

// The clearing-status match lives in one place for every table that carries one
// (§4.10) — the dashboards count the same statuses and must not drift from the
// list. It still resolves the master by text so reseeding the ids can't silently
// break the filter (the doc's Q-11 concern).
const statusIs = (text: string): SQL => clearingStatusIs(importT.clearingStatus, text);

const PREDICATES: Record<ImportFilterKey, SQL> = {
  completed: statusIs(CLEARING_STATUS.completed),
  in_progress: statusIs(CLEARING_STATUS.inProgress),
  in_transit: statusIs(CLEARING_STATUS.inTransit),
  crf_missing: sql`(${importT.crfReference} IS NULL OR ${importT.crfReference} = '' OR ${importT.crfReceivedDate} IS NULL)`,
  ad_missing: sql`${importT.adDate} IS NULL`,
  insurance_missing: sql`(${importT.insuranceDate} IS NULL OR ${importT.insuranceAmount} IS NULL)`,
  audited_pending: sql`${importT.auditedDate} IS NULL`,
  archived_pending: sql`${importT.archivedDate} IS NULL`,
  dgda_in_pending: sql`${importT.dgdaInDate} IS NULL`,
  liquidation_pending: sql`${importT.liquidationDate} IS NULL`,
  quittance_pending: sql`${importT.quittanceDate} IS NULL`,
  // Canonical definition (doc C-01): a file cannot leave DGDA before quittance,
  // so "DGDA Out Pending" only counts files that HAVE reached quittance.
  dgda_out_pending: sql`(${importT.dgdaOutDate} IS NULL AND ${importT.quittanceDate} IS NOT NULL)`,
  dispatch_deliver_pending: sql`${importT.dispatchDeliverDate} IS NULL`,
};

export const IMPORT_FILTER_KEYS = Object.keys(PREDICATES) as ImportFilterKey[];

export function isImportFilterKey(key: string): key is ImportFilterKey {
  return key in PREDICATES;
}

/** Predicate for one filter key, or null if the key is not a status filter. */
export function importFilterCondition(key: string): SQL | null {
  return isImportFilterKey(key) ? PREDICATES[key] : null;
}

/** All predicates as `{ key: SQL }` — used by the statistics conditional counts. */
export function importFilterPredicates(): Record<ImportFilterKey, SQL> {
  return PREDICATES;
}
