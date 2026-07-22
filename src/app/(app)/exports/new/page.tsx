'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'export'. entityId 'new' = create.
export default function NewExportPage() {
  return <TransactionalPage slug="export" entityId="new" />;
}
