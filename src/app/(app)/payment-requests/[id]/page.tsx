'use client';

import { useParams } from 'next/navigation';
import { CaseDetailPage } from '@/components/case/CaseDetailPage';

export default function PaymentRequestDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <CaseDetailPage
      templateKey="payment_request_default"
      caseId={params?.id}
      titlePrefix="Payment request #"
      subtitle={
        <>
          Template <code>payment_request_default</code> · target table{' '}
          <code>payment_request_t</code>
        </>
      }
      backHref="/payment-requests"
      newHref="/payment-requests/new"
    />
  );
}
