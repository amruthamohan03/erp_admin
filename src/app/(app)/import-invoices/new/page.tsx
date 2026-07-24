'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'import-invoices'. entityId 'new' = create.
// The MCA + items grid becomes available on the edit view once the header row
// exists (TransactionalPage redirects to /import-invoices/[id] after first save).
export default function NewImportInvoicePage() {
  return <TransactionalPage slug="import-invoices" entityId="new" />;
}
