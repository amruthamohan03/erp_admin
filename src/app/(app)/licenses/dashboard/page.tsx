'use client';

import LicenseDashboardTabsView, {
  type LicenseDashboardConfig,
} from '@/modules/licenses/licenseDashboard/LicenseDashboardTabsView';

// §4.29 — Import Licence dashboard. Shares its implementation with the Export
// one; only the scope and the wording differ.
const CONFIG: LicenseDashboardConfig = {
  useFor: 'import',
  heading: 'Import Licence Dashboard',
  subtitle: 'Comprehensive license analytics and insights',
  basePath: '/licenses',
  listLabel: 'Licences',
};

export default function ImportLicenseDashboardPage() {
  return <LicenseDashboardTabsView config={CONFIG} />;
}
