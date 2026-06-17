'use client';

import { CaseNewPage } from '@/components/case/CaseNewPage';

export default function NewLicensePage() {
  return (
    <CaseNewPage
      templateKey="license_default"
      formKey="license_create"
      title="Issue a license"
      subtitle={
        <>
          Driven by the <code>license_create</code> form definition + the{' '}
          <code>license_default</code> workflow.
        </>
      }
      backHref="/licenses"
      backLabel="← Back to licenses"
      submitLabel="Create license"
      successHref={(caseId) => `/licenses/${caseId}`}
    />
  );
}
