'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';
import PaymentMcaGrid from '@/modules/payment/PaymentMcaGrid';

// §4.12 page shim — master_page slug 'payment'. `[id]` is the payment_request_t id.
// Header is the transaction-page; the MCA-reference grid (split lines, tracking-table
// validation, duplicate check) is the custom component below it.
export default function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <>
      <TransactionalPage slug="payment" entityId={id} />
      <PaymentMcaGrid paymentId={Number(id)} />
    </>
  );
}
