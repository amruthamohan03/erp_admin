'use client';

import TrackingDashboardView, {
  type TrackingDashboardConfig,
} from '@/modules/tracking/TrackingDashboardView';

// §4.29 — Export Tracking dashboard. Mirrors the import one.
const CONFIG: TrackingDashboardConfig = {
  title: 'Export Tracking Dashboard',
  endpoint: '/api/v1/exports/dashboard',
  listHref: '/exports',
  kpiHref: '/exkpi',
  kpiLabel: 'Delay KPI',
  anchorLabel: 'Loading Date',
  noun: 'export files',
};

export default function ExportDashboardPage() {
  return <TrackingDashboardView config={CONFIG} />;
}
