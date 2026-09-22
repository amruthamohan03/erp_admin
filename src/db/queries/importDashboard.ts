import { importT } from '@/db/schema';
import { importFilterPredicates } from './importFilters';
import { getTrackingDashboard, type TrackingDashboard } from './trackingDashboard';

// §4.29 — the Import Tracking dashboard. The shape and every aggregate live in
// `trackingDashboard`; this file is only the wiring that says which columns of
// `imports_t` play which part.

/**
 * The stages an import file waits at, in the order operators work them.
 *
 * Keys are the list's own `status_filters` keys, so every tile links to the
 * exact rows it counted (§4.29) and the two can never drift (§4.10).
 */
const STAGES = [
  { key: 'crf_missing', label: 'CRF Missing' },
  { key: 'ad_missing', label: 'AD Missing' },
  { key: 'insurance_missing', label: 'Insurance Missing' },
  { key: 'dgda_in_pending', label: 'DGDA In Pending' },
  { key: 'liquidation_pending', label: 'Liquidation Pending' },
  { key: 'quittance_pending', label: 'Quittance Pending' },
  { key: 'dgda_out_pending', label: 'DGDA Out Pending' },
  { key: 'dispatch_deliver_pending', label: 'Dispatch / Deliver Pending' },
  { key: 'audited_pending', label: 'Audit Pending' },
  { key: 'archived_pending', label: 'Archive Pending' },
] as const;

export function getImportDashboard(): Promise<TrackingDashboard> {
  return getTrackingDashboard({
    table: importT,
    id: importT.id,
    // Both taken from the `total_journey` KPI stage (src/lib/imkpi/stages.ts),
    // so "how long did this take" spans the same dates here as on /imkpi.
    anchorDate: importT.preAlertDate,
    completionDate: importT.dispatchDeliverDate,
    clientId: importT.clientId,
    clearingStatus: importT.clearingStatus,
    mcaRef: importT.mcaRef,
    weight: importT.weight,
    fob: importT.fob,
    display: importT.display,
    predicates: importFilterPredicates(),
    stages: STAGES,
  });
}
