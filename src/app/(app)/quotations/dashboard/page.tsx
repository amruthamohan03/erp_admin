'use client';

import QuotationDashboardView from '@/modules/quotations/quotationDashboard/QuotationDashboardView';

// §4.29 — the Quotation dashboard. Every figure is a SQL aggregate over live
// rows; this page is only the route.
export default function QuotationDashboardPage() {
  return <QuotationDashboardView />;
}
