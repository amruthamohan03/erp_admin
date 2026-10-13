'use client';

import LicenseDashboardTabsView, {
  type LicenseDashboardConfig,
} from '@/modules/licenses/licenseDashboard/LicenseDashboardTabsView';

// §4.29 — Export Licence dashboard. Every figure is scoped to kinds flagged
// `use_for_export`, server-side.
const CONFIG: LicenseDashboardConfig = {
  useFor: 'export',
  heading: 'Export Licence Dashboard',
  subtitle: 'Comprehensive license analytics and insights',
  basePath: '/export-licenses',
  listLabel: 'Licences',
};

export default function ExportLicenseDashboardPage() {
  return <LicenseDashboardTabsView config={CONFIG} />;
}
