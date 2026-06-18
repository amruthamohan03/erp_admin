'use client';

import { useParams } from 'next/navigation';
import { CaseDetailPage } from '@/components/case/CaseDetailPage';

export default function TrackingDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <CaseDetailPage
      templateKey="tracking_default"
      caseId={params?.id}
      titlePrefix="Tracking #"
      subtitle={
        <>
          Template <code>tracking_default</code> · target table{' '}
          <code>tracking_t</code>
        </>
      }
      backHref="/tracking"
      newHref="/tracking/new"
    />
  );
}
