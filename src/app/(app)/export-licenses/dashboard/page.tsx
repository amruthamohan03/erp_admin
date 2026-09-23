'use client';

import LicenseDashboardView, {
  type LicenseDashboardConfig,
} from '@/modules/licenses/LicenseDashboardView';

// §4.29 — Export Licence dashboard. Every figure is scoped to kinds flagged
// `use_for_export`, server-side.
const CONFIG: LicenseDashboardConfig = {
  useFor: 'export',
  heading: 'Export Licence Dashboard',
  basePath: '/export-licenses',
  listLabel: 'Open the export licence list',
};

export default function ExportLicenseDashboardPage() {
  return <LicenseDashboardView config={CONFIG} />;
}
