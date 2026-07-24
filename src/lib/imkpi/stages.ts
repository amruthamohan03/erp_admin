// Import Delay KPI — the milestone stages measured, their targets, and the
// pretty labels for each date column. Ported from main's getStageDefinitions.
// A stage's delay is the working-days (Mon–Fri minus DRC holidays) span from
// its `from` date to its `to` date; pending rows age to today.

export interface StageDef {
  key: string;
  label: string;
  short: string;
  from: string;
  to: string;
  threshold: number;
  priority: boolean;
  color: string;
  icon: string;
}

export const STAGE_DEFS: StageDef[] = [
  { key: 'pre_to_zambia', label: 'Pre Alert → Arrival Zambia', short: 'Pre Alert', from: 'pre_alert_date', to: 'arrival_date_zambia', threshold: 7, priority: false, color: '#6366f1', icon: 'ti-clock-play' },
  { key: 'zambia_dispatch', label: 'Arrival → Dispatch Zambia', short: 'Zambia Wait', from: 'arrival_date_zambia', to: 'dispatch_from_zambia', threshold: 3, priority: false, color: '#f59e0b', icon: 'ti-clock-pause' },
  { key: 'zambia_to_drc', label: 'Dispatch Zambia → DRC Entry', short: 'Zambia→DRC', from: 'dispatch_from_zambia', to: 'drc_entry_date', threshold: 2, priority: false, color: '#84cc16', icon: 'ti-flag' },
  { key: 'drc_to_wh', label: 'DRC Entry → WH Arrival', short: 'DRC→WH', from: 'drc_entry_date', to: 'border_warehouse_arrival_date', threshold: 3, priority: true, color: '#10b981', icon: 'ti-building-warehouse' },
  { key: 'border_wh_dispatch', label: 'WH Arrival → Dispatch from Border', short: 'WH → Dispatch', from: 'border_warehouse_arrival_date', to: 'dispatch_from_border', threshold: 3, priority: false, color: '#0ea5e9', icon: 'ti-send' },
  { key: 'border_dispatch_to_deliver', label: 'Dispatch from Border → Delivered', short: 'Dispatch→Deliver', from: 'dispatch_from_border', to: 'dispatch_deliver_date', threshold: 2, priority: false, color: '#14b8a6', icon: 'ti-truck-delivery' },
  { key: 'customs_processing', label: 'DGDA In → DGDA Out', short: 'Customs', from: 'dgda_in_date', to: 'dgda_out_date', threshold: 5, priority: false, color: '#f97316', icon: 'ti-shield' },
  { key: 'dgda_to_liquidation', label: 'DGDA In → Liquidation Date', short: 'DGDA→Liquidation', from: 'dgda_in_date', to: 'liquidation_date', threshold: 2, priority: true, color: '#dc2626', icon: 'ti-file-invoice' },
  { key: 'liquidation_to_quittance', label: 'Liquidation → Quittance Date', short: 'Liquid→Quittance', from: 'liquidation_date', to: 'quittance_date', threshold: 2, priority: true, color: '#b91c1c', icon: 'ti-file-dollar' },
  { key: 'drc_to_deliver', label: 'DRC Entry → Delivered', short: 'DRC→Deliver', from: 'drc_entry_date', to: 'dispatch_deliver_date', threshold: 5, priority: true, color: '#e11d48', icon: 'ti-flag-3' },
  { key: 'total_journey', label: 'Pre Alert → Delivered (Total)', short: 'Total Journey', from: 'pre_alert_date', to: 'dispatch_deliver_date', threshold: 21, priority: false, color: '#1d4ed8', icon: 'ti-route' },
];

// Client-comparison columns → the stage they average.
export const CLIENT_STAGE_ALIASES: Record<string, string> = {
  total_journey: 'avg_total',
  pre_to_zambia: 'avg_pre_zambia',
  zambia_dispatch: 'avg_zambia_wait',
  drc_to_wh: 'avg_drc_border',
  border_wh_dispatch: 'avg_border_wait',
  customs_processing: 'avg_customs',
  dgda_to_liquidation: 'avg_dgda_liquid',
  liquidation_to_quittance: 'avg_liquid_quittance',
};

// Every milestone date column referenced, with a human label.
export const FIELD_LABELS: Record<string, string> = {
  pre_alert_date: 'Pre Alert', arrival_date_zambia: 'Arrival Zambia', dispatch_from_zambia: 'Dispatch Zambia',
  drc_entry_date: 'DRC Entry', border_warehouse_arrival_date: 'Border WH Arrival', dispatch_from_border: 'Dispatch Border',
  kanyaka_arrival_date: 'Kanyaka Arrival', kanyaka_dispatch_date: 'Kanyaka Dispatch',
  warehouse_arrival_date: 'WH Arrival', warehouse_departure_date: 'WH Departure',
  dispatch_deliver_date: 'Dispatch / Deliver', dgda_in_date: 'DGDA In', dgda_out_date: 'DGDA Out',
  liquidation_date: 'Liquidation', quittance_date: 'Quittance',
};

// All distinct date columns used across stages + the extra summary fields.
export const ALL_DATE_COLUMNS = [
  'pre_alert_date', 'arrival_date_zambia', 'dispatch_from_zambia', 'drc_entry_date',
  'border_warehouse_arrival_date', 'dispatch_from_border', 'dispatch_deliver_date',
  'dgda_in_date', 'dgda_out_date', 'liquidation_date', 'quittance_date', 'warehouse_arrival_date',
] as const;
