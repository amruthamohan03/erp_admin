'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';
import InvoiceGrid from '@/modules/invoice/InvoiceGrid';

// §4.12 page shim — master_page slug 'import-invoices'. `[id]` is the
// import_invoices_t id. Header is the transaction-page; the MCA-detail + items
// grid is a custom component wired to /api/v1/import-invoices/[id]/grid.
export default function ImportInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <>
      <TransactionalPage slug="import-invoices" entityId={id} />
      <InvoiceGrid kind="import" invoiceId={Number(id)} />
    </>
  );
}
