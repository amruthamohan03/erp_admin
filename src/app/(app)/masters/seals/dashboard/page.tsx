'use client';

import SealDashboardView from '@/modules/seals/sealDashboard/SealDashboardView';

// §4.29 — the Seal Tracker dashboard. Every figure is a SQL aggregate over
// live rows; this page is only the route.
export default function SealDashboardPage() {
  return <SealDashboardView />;
}
