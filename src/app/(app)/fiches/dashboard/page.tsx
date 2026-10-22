'use client';

import FicheDashboardView from '@/modules/fiche/ficheDashboard/FicheDashboardView';

// §4.29 — the Fiche de Calcul dashboard. Every figure is a SQL aggregate over
// live rows; this page is only the route.
export default function FicheDashboardPage() {
  return <FicheDashboardView />;
}
