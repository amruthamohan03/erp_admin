'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'fiche'. entityId 'new' = create.
export default function NewFichePage() {
  return <TransactionalPage slug="fiche" entityId="new" />;
}
