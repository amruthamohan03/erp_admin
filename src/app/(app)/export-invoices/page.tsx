'use client';

import InvoiceListPage from '@/modules/invoice/InvoiceListPage';

// §2 step 5 — Export Invoice list. Create/edit lives at /export-invoices/new and
// /export-invoices/[id] (transaction-pages header + custom grid).
export default function ExportInvoicesPage() {
  return <InvoiceListPage kind="export" />;
}
