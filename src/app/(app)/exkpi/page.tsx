'use client';

import KpiDelayView, { type KpiConfig } from '@/modules/kpi/KpiDelayView';

// Export Delay KPI — read-only analytics over export milestones. Uses the shared
// KpiDelayView; only the export-specific config lives here.
const CONFIG: KpiConfig = {
  endpoint: 'exkpi',
  title: 'Export Delay KPI',
  listHref: '/exports',
  listLabel: 'Exports',
  totalKey: 'total_exports',
  totalLabel: 'Total Exports',
  totalThreshold: 21,
  avgTotalSub: 'Loading → Exit DRC',
  fieldLabels: {
    loading_date: 'Loading', pv_date: 'PV', bp_date: 'BP', demande_attestation_date: "Demande d'Attest.", assay_date: 'Assay',
    ceec_in_date: 'CEEC In', ceec_out_date: 'CEEC Out', min_div_in_date: 'Min Div In', min_div_out_date: 'Min Div Out',
    gov_docs_in_date: 'Gov Docs In', gov_docs_out_date: 'Gov Docs Out',
    dgda_in_date: 'DGDA In', dgda_out_date: 'DGDA Out', liquidation_date: 'Liquidation', quittance_date: 'Quittance',
    dispatch_deliver_date: 'Dispatch', border_arrival_date: 'Border Arrival', exit_drc_date: 'Exit DRC',
  },
  clientColumns: [
    { header: 'Avg Total', alias: 'avg_total', threshold: 21 },
    { header: 'Load→BP', alias: 'avg_loading_bp', threshold: 3 },
    { header: 'CEEC', alias: 'avg_ceec', threshold: 3 },
    { header: 'Customs', alias: 'avg_customs', threshold: 5 },
    { header: 'DGDA→Liq', alias: 'avg_dgda_liquid', threshold: 2 },
    { header: 'Liq→Quitt', alias: 'avg_liquid_quittance', threshold: 2 },
    { header: 'Border→Exit', alias: 'avg_border_exit', threshold: 2 },
  ],
  drillFields: [
    ['Buyer', 'buyer'], ['Transporter', 'transporter'], ['License', 'license_number'], ['Goods', 'goods_type'],
    ['Kind', 'kind_name'], ['Transport', 'transport_mode'], ['Weight', 'weight', ' kg'], ['Status', 'clearing_status'],
    ['Loading', 'loading_date'], ['BP', 'bp_date'], ['Assay', 'assay_date'], ['CEEC In', 'ceec_in_date'], ['CEEC Out', 'ceec_out_date'],
    ['DGDA In', 'dgda_in_date'], ['DGDA Out', 'dgda_out_date'], ['Liquidation', 'liquidation_date'], ['Quittance', 'quittance_date'],
    ['Dispatch', 'dispatch_deliver_date'], ['Border Arr', 'border_arrival_date'], ['Exit DRC', 'exit_drc_date'],
  ],
};

export default function ExkpiPage() {
  return <KpiDelayView cfg={CONFIG} />;
}
