'use client';

import ComparisonView from '@/modules/comparison/ComparisonView';

// §4.29 — Licence comparison. The screen is shared with the Client and Tracking
// comparisons; only the endpoint and the wording are this module's.
export default function LicenseComparisonPage() {
  return (
    <ComparisonView
      endpoint="/api/v1/licenses/comparison"
      title="License Comparison"
      subtitle="Licences raised, validated and expiring — compared by period, client, import vs export, or entry / exit post"
    />
  );
}
