// Export Delay KPI — the milestone stages measured, their targets, and the date
// column labels. Mirrors imkpi/stages but for the export pipeline: loading →
// assay → CEEC → declaration/liquidation/quittance → dispatch → border → exit.
// A stage's delay is the working-days span from `from` to `to`; pending rows age
// to today.
import type { StageDef } from '@/lib/imkpi/stages';

export type { StageDef };

export const STAGE_DEFS: StageDef[] = [
  { key: 'loading_to_bp', label: 'Loading → BP', short: 'Loading→BP', from: 'loading_date', to: 'bp_date', threshold: 3, priority: false, color: '#6366f1', icon: 'ti-clock-play' },
  { key: 'bp_to_assay', label: 'BP → Assay', short: 'BP→Assay', from: 'bp_date', to: 'assay_date', threshold: 5, priority: false, color: '#f59e0b', icon: 'ti-flask' },
  { key: 'ceec', label: 'CEEC In → CEEC Out', short: 'CEEC', from: 'ceec_in_date', to: 'ceec_out_date', threshold: 3, priority: true, color: '#10b981', icon: 'ti-certificate' },
  { key: 'min_div', label: 'Min Div In → Min Div Out', short: 'Min Div', from: 'min_div_in_date', to: 'min_div_out_date', threshold: 3, priority: false, color: '#0ea5e9', icon: 'ti-scale' },
  { key: 'gov_docs', label: 'Gov Docs In → Gov Docs Out', short: 'Gov Docs', from: 'gov_docs_in_date', to: 'gov_docs_out_date', threshold: 3, priority: false, color: '#14b8a6', icon: 'ti-files' },
  { key: 'customs', label: 'DGDA In → DGDA Out', short: 'Customs', from: 'dgda_in_date', to: 'dgda_out_date', threshold: 5, priority: false, color: '#f97316', icon: 'ti-shield' },
  { key: 'dgda_to_liquidation', label: 'DGDA In → Liquidation', short: 'DGDA→Liq', from: 'dgda_in_date', to: 'liquidation_date', threshold: 2, priority: true, color: '#dc2626', icon: 'ti-file-invoice' },
  { key: 'liquidation_to_quittance', label: 'Liquidation → Quittance', short: 'Liq→Quitt', from: 'liquidation_date', to: 'quittance_date', threshold: 2, priority: true, color: '#b91c1c', icon: 'ti-file-dollar' },
  { key: 'dispatch_to_border', label: 'Dispatch → Border Arrival', short: 'Disp→Border', from: 'dispatch_deliver_date', to: 'border_arrival_date', threshold: 3, priority: false, color: '#0284c7', icon: 'ti-send' },
  { key: 'border_to_exit', label: 'Border Arrival → Exit DRC', short: 'Border→Exit', from: 'border_arrival_date', to: 'exit_drc_date', threshold: 2, priority: true, color: '#e11d48', icon: 'ti-flag-3' },
  { key: 'total_journey', label: 'Loading → Exit DRC (Total)', short: 'Total Journey', from: 'loading_date', to: 'exit_drc_date', threshold: 21, priority: false, color: '#1d4ed8', icon: 'ti-route' },
];

// Client-comparison columns → the stage they average.
export const CLIENT_STAGE_ALIASES: Record<string, string> = {
  total_journey: 'avg_total',
  loading_to_bp: 'avg_loading_bp',
  ceec: 'avg_ceec',
  customs: 'avg_customs',
  dgda_to_liquidation: 'avg_dgda_liquid',
  liquidation_to_quittance: 'avg_liquid_quittance',
  border_to_exit: 'avg_border_exit',
};

export const FIELD_LABELS: Record<string, string> = {
  loading_date: 'Loading', pv_date: 'PV', bp_date: 'BP', demande_attestation_date: "Demande d'Attest.", assay_date: 'Assay',
  ceec_in_date: 'CEEC In', ceec_out_date: 'CEEC Out', min_div_in_date: 'Min Div In', min_div_out_date: 'Min Div Out',
  gov_docs_in_date: 'Gov Docs In', gov_docs_out_date: 'Gov Docs Out',
  dgda_in_date: 'DGDA In', dgda_out_date: 'DGDA Out', liquidation_date: 'Liquidation', quittance_date: 'Quittance',
  dispatch_deliver_date: 'Dispatch', border_arrival_date: 'Border Arrival', exit_drc_date: 'Exit DRC',
  kanyaka_arrival_date: 'Kanyaka Arrival', kanyaka_departure_date: 'Kanyaka Departure', end_of_formalities_date: 'End Formalities',
};
