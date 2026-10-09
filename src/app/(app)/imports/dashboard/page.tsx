'use client';

import ImportDashboardView from '@/modules/tracking/importDashboard/ImportDashboardView';

// §4.29 — Import Tracking dashboard. Everything but the route lives in the
// module: seven tabs over `imports_t`, sharing the UI kit, the fetch hook and
// the chart components with the Export dashboard.

export default function ImportDashboardPage() {
  return <ImportDashboardView />;
}
