'use client';

import SydoniaBulkUpdate from '@/modules/sydonia/SydoniaBulkUpdate';

// §3 Import Sydonia — Excel bulk-update of declaration/liquidation/quittance
// milestones onto existing import files (matched by MCA ref).
export default function ImportSydoniaPage() {
  return <SydoniaBulkUpdate kind="import" />;
}
