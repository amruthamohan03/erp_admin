// Server-only: maps an import dashboard-card key to the SQL condition that backs
// its count (and the matching ?card= list filter). Used by BOTH /api/imports/stats
// and /api/imports so a card's count and its filtered list always agree.
//
// The card display metadata (title/icon/colour/order) lives in
// dashboard_card_master_t; only the count/filter LOGIC lives here. Keys match the
// `card_content_id` / data_source path of each seeded card (see migration 0053).
//
// "Completed / In Progress / In Transit" map to clearing_status_master_t ids:
//   4 IN TRANSIT · 5 IN PROGRESS · 6 CLEARING COMPLETED · 8 CLEARED WITH IR · 9 CLEARED WITH ARA
// Adjust COMPLETED_STATUS_IDS if the business rule differs.
import { eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { imports } from '@/db/schema';

export const COMPLETED_STATUS_IDS = [6, 8, 9];
export const IN_PROGRESS_STATUS_ID = 5;
export const IN_TRANSIT_STATUS_ID = 4;

// All card keys in display order (the stats endpoint returns a count per key).
export const IMPORT_CARD_KEYS = [
  'all',
  'completed',
  'in_progress',
  'in_transit',
  'crf_missing',
  'ad_missing',
  'insurance_missing',
  'audited_pending',
  'archived_pending',
  'dgda_in_pending',
  'liquidation_pending',
  'quittance_pending',
  'dgda_out_pending',
  'dispatch_pending',
] as const;

export type ImportCardKey = (typeof IMPORT_CARD_KEYS)[number];

/**
 * SQL condition for a card key, or null for 'all' / unknown keys (no extra
 * filter beyond the always-on display = 'Y'). All "*_missing" / "*_pending"
 * cards mean the corresponding milestone column IS NULL.
 */
export function cardCondition(key: string): SQL | null {
  switch (key) {
    case 'completed': return inArray(imports.clearingStatus, COMPLETED_STATUS_IDS);
    case 'in_progress': return eq(imports.clearingStatus, IN_PROGRESS_STATUS_ID);
    case 'in_transit': return eq(imports.clearingStatus, IN_TRANSIT_STATUS_ID);
    case 'crf_missing': return isNull(imports.crfReceivedDate);
    case 'ad_missing': return isNull(imports.adDate);
    case 'insurance_missing': return isNull(imports.insuranceDate);
    case 'audited_pending': return isNull(imports.auditedDate);
    case 'archived_pending': return isNull(imports.archivedDate);
    case 'dgda_in_pending': return isNull(imports.dgdaInDate);
    case 'liquidation_pending': return isNull(imports.liquidationDate);
    case 'quittance_pending': return isNull(imports.quittanceDate);
    case 'dgda_out_pending': return isNull(imports.dgdaOutDate);
    case 'dispatch_pending': return isNull(imports.dispatchDeliverDate);
    case 'all':
    default:
      return null;
  }
}
