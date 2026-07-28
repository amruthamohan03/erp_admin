// §8 Export dashboard — the ONE definition of every status-filter predicate,
// shared by the list query and the statistics counters so the cards can never
// disagree with the grid (mirrors importFilters). Each key maps to a Drizzle
// `SQL` predicate over `exports_t`; clearing-status keys resolve the master id by
// text (master-driven, not a hardcoded id — §4.1).
import { sql, type SQL } from 'drizzle-orm';
import { exportT } from '@/db/schema';

export type ExportFilterKey =
  | 'completed'
  | 'in_progress'
  | 'in_transit'
  | 'ceec_pending'
  | 'min_div_pending'
  | 'gov_docs_pending'
  | 'audited_pending'
  | 'archived_pending'
  | 'dgda_in_pending'
  | 'liquidation_pending'
  | 'quittance_pending'
  | 'dispatch_pending'
  | 'seal_pending'
  | 'lmc_id_pending'
  | 'lmc_date_pending'
  | 'ogefrem_ref_pending'
  | 'ogefrem_date_pending';

// Clearing-status match resolved from the master text so reseeding the master
// ids can't silently break the filter.
function clearingStatusIs(text: string): SQL {
  return sql`${exportT.clearingStatus} IN (
    SELECT id FROM clearing_status_master_t WHERE upper(clearing_status) = ${text})`;
}

const PREDICATES: Record<ExportFilterKey, SQL> = {
  completed: clearingStatusIs('CLEARING COMPLETED'),
  in_progress: clearingStatusIs('IN PROGRESS'),
  in_transit: clearingStatusIs('IN TRANSIT'),
  ceec_pending: sql`(${exportT.ceecInDate} IS NULL OR ${exportT.ceecOutDate} IS NULL)`,
  min_div_pending: sql`(${exportT.minDivInDate} IS NULL OR ${exportT.minDivOutDate} IS NULL)`,
  gov_docs_pending: sql`(${exportT.govDocsInDate} IS NULL OR ${exportT.govDocsOutDate} IS NULL)`,
  audited_pending: sql`${exportT.auditedDate} IS NULL`,
  archived_pending: sql`${exportT.archivedDate} IS NULL`,
  dgda_in_pending: sql`${exportT.dgdaInDate} IS NULL`,
  liquidation_pending: sql`${exportT.liquidationDate} IS NULL`,
  quittance_pending: sql`${exportT.quittanceDate} IS NULL`,
  dispatch_pending: sql`${exportT.dispatchDeliverDate} IS NULL`,
  seal_pending: sql`(${exportT.dgdaSealNo} IS NULL OR ${exportT.dgdaSealNo} = '' OR ${exportT.numberOfSeals} IS NULL OR ${exportT.numberOfSeals} = 0)`,
  lmc_id_pending: sql`(${exportT.lmcId} IS NULL OR ${exportT.lmcId} = '')`,
  lmc_date_pending: sql`${exportT.lmcDate} IS NULL`,
  ogefrem_ref_pending: sql`(${exportT.ogefremInvRef} IS NULL OR ${exportT.ogefremInvRef} = '')`,
  ogefrem_date_pending: sql`${exportT.ogefremDate} IS NULL`,
};

export const EXPORT_FILTER_KEYS = Object.keys(PREDICATES) as ExportFilterKey[];

export function isExportFilterKey(key: string): key is ExportFilterKey {
  return key in PREDICATES;
}

/** Predicate for one filter key, or null if the key is not a status filter. */
export function exportFilterCondition(key: string): SQL | null {
  return isExportFilterKey(key) ? PREDICATES[key] : null;
}

/** All predicates as `{ key: SQL }` — used by the statistics conditional counts. */
export function exportFilterPredicates(): Record<ExportFilterKey, SQL> {
  return PREDICATES;
}
