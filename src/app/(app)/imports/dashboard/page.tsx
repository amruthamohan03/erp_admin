'use client';

import TrackingDashboardView, {
  type TrackingDashboardConfig,
} from '@/modules/tracking/TrackingDashboardView';

// §4.29 — Import Tracking dashboard. Everything but the wiring lives in the
// shared view and in `importDashboard.ts`.
const CONFIG: TrackingDashboardConfig = {
  title: 'Import Tracking Dashboard',
  endpoint: '/api/v1/imports/dashboard',
  listHref: '/imports',
  kpiHref: '/imkpi',
  kpiLabel: 'Delay KPI',
  anchorLabel: 'Pre Alert Date',
  noun: 'import files',
};

export default function ImportDashboardPage() {
  return <TrackingDashboardView config={CONFIG} />;
}
