'use client';

import { useParams } from 'next/navigation';
import { CaseDetailPage } from '@/components/case/CaseDetailPage';

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <CaseDetailPage
      templateKey="invoice_default"
      caseId={params?.id}
      titlePrefix="Invoice #"
      subtitle={
        <>
          Template <code>invoice_default</code> · target table{' '}
          <code>invoice_t</code>
        </>
      }
      backHref="/invoices"
      newHref="/invoices/new"
    />
  );
}
