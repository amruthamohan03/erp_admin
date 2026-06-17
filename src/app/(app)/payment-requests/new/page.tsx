'use client';

import { CaseNewPage } from '@/components/case/CaseNewPage';

export default function NewPaymentRequestPage() {
  return (
    <CaseNewPage
      templateKey="payment_request_default"
      formKey="payment_request_create"
      title="Submit a payment request"
      subtitle={
        <>
          Driven by the <code>payment_request_create</code> form definition +
          the <code>payment_request_default</code> workflow (Dept Head →
          Finance → CEO).
        </>
      }
      backHref="/payment-requests"
      backLabel="← Back"
      submitLabel="Submit request"
      successHref={(caseId) => `/payment-requests/${caseId}`}
    />
  );
}
