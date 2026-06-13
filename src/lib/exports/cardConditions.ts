// Server-only: maps an export dashboard-card key to the SQL condition that backs
// its count (and the matching ?card= list filter). Used by BOTH /api/exports/stats
// and /api/exports so a card's count and its filtered list always agree.
//
// Card display metadata (title/icon/colour/order) lives in dashboard_card_master_t;
// only the count/filter LOGIC lives here. Keys match each seeded card's
// card_content_id / data_source path (see migration 0068).
//
// Clearing-status ids are shared with imports (clearing_status_master_t):
//   4 IN TRANSIT · 5 IN PROGRESS · 6 CLEARING COMPLETED · 8 CLEARED WITH IR · 9 CLEARED WITH ARA
import { eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { exports } from '@/db/schema';

export const COMPLETED_STATUS_IDS = [6, 8, 9];
export const IN_PROGRESS_STATUS_ID = 5;
export const IN_TRANSIT_STATUS_ID = 4;

// All card keys in display order (the stats endpoint returns a count per key).
export const EXPORT_CARD_KEYS = [
  'all',
  'completed',
  'in_progress',
  'in_transit',
  'ceec_pending',
  'min_div_pending',
  'gov_docs_pending',
  'audited_pending',
  'archived_pending',
  'dgda_in_pending',
  'liquidation_pending',
  'quittance_pending',
  'dispatch_pending',
  'seal_pending',
  'lmc_id_pending',
  'lmc_date_pending',
  'ogefrem_ref_pending',
  'ogefrem_date_pending',
] as const;

export type ExportCardKey = (typeof EXPORT_CARD_KEYS)[number];

/**
 * SQL condition for a card key, or null for 'all' / unknown keys (no extra filter
 * beyond the always-on display = 'Y'). "*_pending" cards mean the corresponding
 * milestone column IS NULL (or blank, for the ref/seal cards).
 */
export function cardCondition(key: string): SQL | null {
  switch (key) {
    case 'completed': return inArray(exports.clearingStatus, COMPLETED_STATUS_IDS);
    case 'in_progress': return eq(exports.clearingStatus, IN_PROGRESS_STATUS_ID);
    case 'in_transit': return eq(exports.clearingStatus, IN_TRANSIT_STATUS_ID);
    case 'ceec_pending': return or(isNull(exports.ceecInDate), isNull(exports.ceecOutDate))!;
    case 'min_div_pending': return or(isNull(exports.minDivInDate), isNull(exports.minDivOutDate))!;
    case 'gov_docs_pending': return or(isNull(exports.govDocsInDate), isNull(exports.govDocsOutDate))!;
    case 'audited_pending': return isNull(exports.auditedDate);
    case 'archived_pending': return isNull(exports.archivedDate);
    case 'dgda_in_pending': return isNull(exports.dgdaInDate);
    case 'liquidation_pending': return isNull(exports.liquidationDate);
    case 'quittance_pending': return isNull(exports.quittanceDate);
    case 'dispatch_pending': return isNull(exports.dispatchDeliverDate);
    case 'seal_pending':
      return or(
        isNull(exports.dgdaSealNo),
        eq(exports.dgdaSealNo, ''),
        isNull(exports.numberOfSeals),
        eq(exports.numberOfSeals, 0),
      )!;
    case 'lmc_id_pending': return or(isNull(exports.lmcId), eq(exports.lmcId, ''))!;
    case 'lmc_date_pending': return isNull(exports.lmcDate);
    case 'ogefrem_ref_pending': return or(isNull(exports.ogefremInvRef), eq(exports.ogefremInvRef, ''))!;
    case 'ogefrem_date_pending': return isNull(exports.ogefremDate);
    case 'all':
    default:
      return null;
  }
}
