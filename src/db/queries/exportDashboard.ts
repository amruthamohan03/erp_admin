import { exportT } from '@/db/schema';
import { exportFilterPredicates } from './exportFilters';
import { getTrackingDashboard, type TrackingDashboard } from './trackingDashboard';

// §4.29 — the Export Tracking dashboard. Mirrors importDashboard; the aggregates
// themselves live in `trackingDashboard`.

/** The stages an export file waits at, keyed as the list's `status_filters`. */
const STAGES = [
  { key: 'ceec_pending', label: 'CEEC Pending' },
  { key: 'min_div_pending', label: 'Min Div Pending' },
  { key: 'gov_docs_pending', label: 'Gov Docs Pending' },
  { key: 'seal_pending', label: 'Seals Pending' },
  { key: 'dgda_in_pending', label: 'DGDA In Pending' },
  { key: 'liquidation_pending', label: 'Liquidation Pending' },
  { key: 'quittance_pending', label: 'Quittance Pending' },
  { key: 'lmc_id_pending', label: 'LMC ID Pending' },
  { key: 'ogefrem_ref_pending', label: 'OGEFREM Ref Pending' },
  { key: 'dispatch_pending', label: 'Dispatch Pending' },
  { key: 'audited_pending', label: 'Audit Pending' },
  { key: 'archived_pending', label: 'Archive Pending' },
] as const;

export function getExportDashboard(): Promise<TrackingDashboard> {
  return getTrackingDashboard({
    table: exportT,
    id: exportT.id,
    // From the export `total_journey` stage (src/lib/exkpi/stages.ts).
    anchorDate: exportT.loadingDate,
    completionDate: exportT.exitDrcDate,
    clientId: exportT.clientId,
    clearingStatus: exportT.clearingStatus,
    mcaRef: exportT.mcaRef,
    weight: exportT.weight,
    fob: exportT.fob,
    display: exportT.display,
    predicates: exportFilterPredicates(),
    stages: STAGES,
  });
}
