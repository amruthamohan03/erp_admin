'use client';

import InvoiceDashboardView from '@/modules/invoice/invoiceDashboard/InvoiceDashboardView';

// §4.29 — the Export Invoice dashboard. Every figure is a SQL aggregate over
// live rows; this page is only the route.
export default function ExportInvoiceDashboardPage() {
  return <InvoiceDashboardView kind="export" />;
}
