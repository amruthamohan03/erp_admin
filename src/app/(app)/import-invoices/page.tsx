'use client';

import ImportInvoiceListPage from '@/modules/invoice/ImportInvoiceListPage';

// §2 step 5 — Import Invoice list (dedicated, DGI workflow + exports + print).
// Create/edit lives at /import-invoices/new and /import-invoices/[id]
// (transaction-pages header + custom grid).
export default function ImportInvoicesPage() {
  return <ImportInvoiceListPage />;
}
