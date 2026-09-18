'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'quotation'. The whole form (header +
// priced lines) is configuration, so this file has nothing in it but the
// runtime, exactly like /imports/new and /payments/new.
//
// `?copy={id}` is the list's Copy action (main's copyQuotation): the new form
// opens with that quotation's pickers and lines, today's date, and its
// reference rebuilt from the pickers — change one of them to make it unique.
function NewQuotation() {
  const copyFrom = useSearchParams().get('copy');
  return <TransactionalPage slug="quotation" entityId="new" copyFrom={copyFrom} />;
}

// useSearchParams needs a Suspense boundary, or Next bails the page out of
// prerendering with a build error.
export default function NewQuotationPage() {
  return (
    <Suspense>
      <NewQuotation />
    </Suspense>
  );
}
