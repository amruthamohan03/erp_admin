'use client';

import LicenseListView, { type LicenseListConfig } from '@/modules/licenses/LicenseListView';

// §4.29/§4.10 — Export Licences: the same list as Import Licences, scoped to
// kinds flagged `use_for_export` (EXPORT DEFINITVE, EXPORT TEMPORARY and
// IMPORT TEMPORARY, which leaves again as a re-export).
const CONFIG: LicenseListConfig = {
  useFor: 'export',
  heading: 'Export Licenses Management',
  listTitle: 'Export License List',
  basePath: '/export-licenses',
  createLabel: 'New Export License',
  slug: 'export-license',
};

export default function ExportLicensesPage() {
  return <LicenseListView config={CONFIG} />;
}
