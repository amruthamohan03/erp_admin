'use client';

import LicenseListView, { type LicenseListConfig } from '@/modules/licenses/LicenseListView';

// §4.29/§4.10 — Import Licences. The screen itself is shared with Export
// Licences; only the scope and the wording differ.
const CONFIG: LicenseListConfig = {
  useFor: 'import',
  heading: 'Import Licenses Management',
  listTitle: 'Import License List',
  basePath: '/licenses',
  createLabel: 'New Import License',
  slug: 'license',
};

export default function ImportLicensesPage() {
  return <LicenseListView config={CONFIG} />;
}
