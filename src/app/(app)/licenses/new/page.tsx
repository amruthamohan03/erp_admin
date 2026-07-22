'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'license'. entityId 'new' = create.
export default function NewLicensePage() {
  return <TransactionalPage slug="license" entityId="new" />;
}
