'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'local'. entityId 'new' = create.
export default function NewLocalPage() {
  return <TransactionalPage slug="local" entityId="new" />;
}
