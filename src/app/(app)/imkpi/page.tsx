'use client';

import KpiDelayView, { type KpiConfig } from '@/modules/kpi/KpiDelayView';

// Import Delay KPI — read-only analytics over import milestones. Uses the shared
// KpiDelayView; only the import-specific config lives here.
const CONFIG: KpiConfig = {
  endpoint: 'imkpi',
  title: 'Import Delay KPI',
  listHref: '/imports',
  listLabel: 'Imports',
  totalKey: 'total_imports',
  totalLabel: 'Total Imports',
  totalThreshold: 21,
  avgTotalSub: 'Pre Alert → Deliver',
  fieldLabels: {
    pre_alert_date: 'Pre Alert', arrival_date_zambia: 'Arrival Zambia', dispatch_from_zambia: 'Dispatch Zambia',
    drc_entry_date: 'DRC Entry', border_warehouse_arrival_date: 'Border WH Arrival', dispatch_from_border: 'Dispatch Border',
    dispatch_deliver_date: 'Dispatch / Deliver', dgda_in_date: 'DGDA In', dgda_out_date: 'DGDA Out',
    liquidation_date: 'Liquidation', quittance_date: 'Quittance', warehouse_arrival_date: 'WH Arrival',
  },
  clientColumns: [
    { header: 'Avg Total', alias: 'avg_total', threshold: 21 },
    { header: 'Pre→Zambia', alias: 'avg_pre_zambia', threshold: 7 },
    { header: 'Zambia Wait', alias: 'avg_zambia_wait', threshold: 3 },
    { header: 'DRC→WH', alias: 'avg_drc_border', threshold: 3 },
    { header: 'Border Wait', alias: 'avg_border_wait', threshold: 3 },
    { header: 'Customs', alias: 'avg_customs', threshold: 5 },
    { header: 'DGDA→Liq', alias: 'avg_dgda_liquid', threshold: 2 },
    { header: 'Liq→Quitt', alias: 'avg_liquid_quittance', threshold: 2 },
  ],
  drillFields: [
    ['Supplier', 'supplier'], ['License', 'license_number'], ['Decl. Office', 'declaration_office'], ['Goods', 'goods_type'],
    ['Kind', 'kind_name'], ['Transport', 'transport_mode'], ['Weight', 'weight', ' kg'], ['Status', 'clearing_status'],
    ['Pre Alert', 'pre_alert_date'], ['Arr Zambia', 'arrival_date_zambia'], ['DRC Entry', 'drc_entry_date'],
    ['Border WH', 'border_warehouse_arrival_date'], ['Disp Border', 'dispatch_from_border'], ['Deliver', 'dispatch_deliver_date'],
    ['DGDA In', 'dgda_in_date'], ['DGDA Out', 'dgda_out_date'], ['Liquidation', 'liquidation_date'], ['Quittance', 'quittance_date'],
  ],
};

export default function ImkpiPage() {
  return <KpiDelayView cfg={CONFIG} />;
}
