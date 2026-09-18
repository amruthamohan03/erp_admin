'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'export-invoices'. entityId 'new' = create.
// Header, MCA files and priced lines are all on this one form and saved together
// (§4.17) — an invoice is created with its files in one go.
export default function NewExportInvoicePage() {
  return <TransactionalPage slug="export-invoices" entityId="new" />;
}
