'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'payment'. `[id]` is the payment_request_t id.
// The MCA-reference grid is the `mca_data` field INSIDE the form (field_type
// 'mca-grid' → McaRefGrid), so its rows are written by the page's single Save
// (§4.17). A second grid used to render below this one with its own Save button;
// two controls writing the same column is what §4.10 forbids, and it could not
// work on /payments/new at all.
export default function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <TransactionalPage slug="payment" entityId={id} />;
}
