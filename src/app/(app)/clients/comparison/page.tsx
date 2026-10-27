'use client';

import ComparisonView from '@/modules/comparison/ComparisonView';

export default function ClientComparisonPage() {
  return (
    <ComparisonView
      endpoint="/api/v1/clients/comparison"
      title="Client Comparison"
      subtitle="Compare tracking files, licences, weight, FOB, billing and clearance time across periods, clients, import against export, or office locations."
    />
  );
}
