'use client';

import { CaseNewPage } from '@/components/case/CaseNewPage';

export default function NewInvoicePage() {
  return (
    <CaseNewPage
      templateKey="invoice_default"
      formKey="invoice_create"
      title="Issue an invoice"
      subtitle={
        <>
          Driven by the <code>invoice_create</code> form definition + the{' '}
          <code>invoice_default</code> workflow.
        </>
      }
      backHref="/invoices"
      backLabel="← Back to invoices"
      submitLabel="Create invoice"
      successHref={(caseId) => `/invoices/${caseId}`}
    />
  );
}
