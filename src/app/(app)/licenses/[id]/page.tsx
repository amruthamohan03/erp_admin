'use client';

import { useParams } from 'next/navigation';
import { CaseDetailPage } from '@/components/case/CaseDetailPage';

export default function LicenseDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <CaseDetailPage
      templateKey="license_default"
      caseId={params?.id}
      titlePrefix="License #"
      subtitle={
        <>
          Template <code>license_default</code> · target table{' '}
          <code>license_t</code>
        </>
      }
      backHref="/licenses"
      newHref="/licenses/new"
    />
  );
}
