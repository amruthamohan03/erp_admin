'use client';

import ExportInvoiceListPage from '@/modules/invoice/ExportInvoiceListPage';

// §2 step 5 — Export Invoice list (dedicated, DGI workflow + DN/INV exports +
// print). Create/edit lives at /export-invoices/new and /export-invoices/[id]
// (transaction-pages header + custom File/quotation grid).
export default function ExportInvoicesPage() {
  return <ExportInvoiceListPage />;
}
