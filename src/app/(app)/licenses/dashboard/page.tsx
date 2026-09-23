'use client';

import LicenseDashboardView, {
  type LicenseDashboardConfig,
} from '@/modules/licenses/LicenseDashboardView';

// §4.29 — Import Licence dashboard. Shares its implementation with the Export
// one; only the scope and the wording differ.
const CONFIG: LicenseDashboardConfig = {
  useFor: 'import',
  heading: 'Import Licence Dashboard',
  basePath: '/licenses',
  listLabel: 'Open the import licence list',
};

export default function ImportLicenseDashboardPage() {
  return <LicenseDashboardView config={CONFIG} />;
}
