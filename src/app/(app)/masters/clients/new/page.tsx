'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — renders the metadata runtime against master_page slug
// 'clients'. entityId 'new' = create.
export default function NewClientPage() {
  return <TransactionalPage slug="clients" entityId="new" />;
}
