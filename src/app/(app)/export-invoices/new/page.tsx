'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'export-invoices'. entityId 'new' = create.
// The MCA + items grid is only available after the header is saved (edit view),
// so create shows the header alone; TransactionalPage redirects to /export-invoices/[id]
// once the header row exists.
export default function NewExportInvoicePage() {
  return <TransactionalPage slug="export-invoices" entityId="new" />;
}
