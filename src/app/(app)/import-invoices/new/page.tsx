'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'import-invoices'. entityId 'new' = create.
// Header, financials, documents, MCA files and priced lines are all on this one
// form and saved together (§4.17) — an invoice is created with its lines in one go.
export default function NewImportInvoicePage() {
  return <TransactionalPage slug="import-invoices" entityId="new" />;
}
