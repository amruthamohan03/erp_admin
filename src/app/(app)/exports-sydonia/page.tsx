'use client';

import SydoniaBulkUpdate from '@/modules/sydonia/SydoniaBulkUpdate';

// §3 Export Sydonia — Excel bulk-update of declaration/liquidation/quittance
// milestones onto existing export files (matched by MCA ref).
export default function ExportSydoniaPage() {
  return <SydoniaBulkUpdate kind="export" />;
}
