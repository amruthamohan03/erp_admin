'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'payment'. entityId 'new' = create.
export default function NewPaymentPage() {
  return <TransactionalPage slug="payment" entityId="new" />;
}
