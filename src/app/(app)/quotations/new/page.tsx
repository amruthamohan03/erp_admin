'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'quotation'. The whole form (header +
// priced lines) is configuration, so this file has nothing in it but the
// runtime, exactly like /imports/new and /payments/new.
export default function NewQuotationPage() {
  return <TransactionalPage slug="quotation" entityId="new" />;
}
