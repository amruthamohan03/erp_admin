'use client';

import InvoiceDashboardView from '@/modules/invoice/invoiceDashboard/InvoiceDashboardView';

// §4.29 — the Import Invoice dashboard. Every figure is a SQL aggregate over
// live rows; this page is only the route.
export default function ImportInvoiceDashboardPage() {
  return <InvoiceDashboardView kind="import" />;
}
