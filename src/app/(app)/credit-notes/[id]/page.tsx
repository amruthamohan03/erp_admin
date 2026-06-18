'use client';

import { useParams } from 'next/navigation';
import { CaseDetailPage } from '@/components/case/CaseDetailPage';

export default function CreditNoteDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <CaseDetailPage
      templateKey="credit_note_default"
      caseId={params?.id}
      titlePrefix="Credit note #"
      subtitle={
        <>
          Template <code>credit_note_default</code> · target table{' '}
          <code>credit_note_t</code>
        </>
      }
      backHref="/credit-notes"
      newHref="/credit-notes/new"
    />
  );
}
