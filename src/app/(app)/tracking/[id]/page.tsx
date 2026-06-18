'use client';

import { useParams } from 'next/navigation';
import { CaseDetailPage } from '@/components/case/CaseDetailPage';
import MilestoneAdvancer from '@/components/tracking/MilestoneAdvancer';

interface CompletedMilestone {
  key: string;
  completedAt: string;
  completedBy: number;
}

function readCompleted(value: unknown): CompletedMilestone[] {
  if (!Array.isArray(value)) return [];
  // Trust the server — schema validation happens at /advance-milestone.
  return value as CompletedMilestone[];
}

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
      extraPanel={(data, reload) => {
        const templateId = data.entity.template_id;
        if (typeof templateId !== 'number') return null;
        const currentMilestoneKey =
          typeof data.entity.current_milestone_key === 'string'
            ? data.entity.current_milestone_key
            : null;
        return (
          <MilestoneAdvancer
            trackingId={data.caseId}
            templateId={templateId}
            state={data.state}
            currentMilestoneKey={currentMilestoneKey}
            milestonesCompleted={readCompleted(
              data.entity.milestones_completed_json,
            )}
            onAdvanced={reload}
          />
        );
      }}
    />
  );
}
