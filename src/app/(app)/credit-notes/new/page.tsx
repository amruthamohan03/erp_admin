'use client';

import { CaseNewPage } from '@/components/case/CaseNewPage';

export default function NewCreditNotePage() {
  return (
    <CaseNewPage
      templateKey="credit_note_default"
      formKey="credit_note_create"
      title="Issue a credit note"
      subtitle={
        <>
          Driven by the <code>credit_note_create</code> form definition + the{' '}
          <code>credit_note_default</code> workflow.
        </>
      }
      backHref="/credit-notes"
      backLabel="← Back to credit notes"
      submitLabel="Create credit note"
      successHref={(caseId) => `/credit-notes/${caseId}`}
    />
  );
}
