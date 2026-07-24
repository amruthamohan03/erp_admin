'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';
import InvoiceGrid from '@/modules/invoice/InvoiceGrid';

// §4.12 page shim — master_page slug 'export-invoices'. `[id]` is the
// export_invoices_t id. Header is the transaction-page; the MCA-detail + items
// grid (main's calculation UI) is a custom component wired to /api/v1/export-invoices/[id]/grid.
export default function ExportInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <>
      <TransactionalPage slug="export-invoices" entityId={id} />
      <InvoiceGrid kind="export" invoiceId={Number(id)} />
    </>
  );
}
