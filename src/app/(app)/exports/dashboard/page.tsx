'use client';

import ExportDashboardView from '@/modules/tracking/exportDashboard/ExportDashboardView';

// §4.29 — Export Tracking dashboard. Everything but the route lives in the
// module: five tabs over `exports_t`, sharing the UI kit, the fetch hook and
// the chart components with the Import dashboard.

export default function ExportDashboardPage() {
  return <ExportDashboardView />;
}
