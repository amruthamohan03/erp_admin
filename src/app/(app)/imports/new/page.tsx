'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'import'. entityId 'new' = create.
export default function NewImportPage() {
  return <TransactionalPage slug="import" entityId="new" />;
}
