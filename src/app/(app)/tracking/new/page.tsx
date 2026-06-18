'use client';

import { CaseNewPage } from '@/components/case/CaseNewPage';

export default function NewTrackingPage() {
  return (
    <CaseNewPage
      templateKey="tracking_default"
      formKey="tracking_create"
      title="Start a tracking run"
      subtitle={
        <>
          Driven by the <code>tracking_create</code> form definition + the{' '}
          <code>tracking_default</code> workflow. The template you pick
          determines whether it runs the Import or Export milestone chain.
        </>
      }
      backHref="/tracking"
      backLabel="← Back to tracking"
      submitLabel="Start tracking"
      successHref={(caseId) => `/tracking/${caseId}`}
    />
  );
}
