'use client';

import ComparisonView from '@/modules/comparison/ComparisonView';

// §4.29 — Tracking Comparison. The screen is the shared comparison view; what
// it measures lives in `src/db/queries/comparison/trackingComparison.ts`.

export default function TrackingComparisonPage() {
  return (
    <ComparisonView
      endpoint="/api/v1/tracking/comparison"
      title="Tracking Comparison"
      subtitle="Import and export files compared by period, client, direction or office — counted on the date each file was opened."
    />
  );
}
