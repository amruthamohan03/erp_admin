'use client';

import * as React from 'react';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Milestone {
  key: string;
  label: string;
  order: number;
}

interface TemplateResponse {
  id: number;
  templateKey: string;
  name: string;
  milestones: Milestone[];
}

interface CompletedMilestone {
  key: string;
  completedAt: string;
  completedBy: number;
}

export interface MilestoneAdvancerProps {
  trackingId: number;
  templateId: number;
  state: string;
  currentMilestoneKey: string | null;
  milestonesCompleted: ReadonlyArray<CompletedMilestone>;
  /** Called after a successful advance so the parent page can re-fetch. */
  onAdvanced: () => Promise<void> | void;
}

// Tracking milestone advancer per §2 step 3. Renders the template's
// milestone chain with a "Mark complete" button for the next-up step.
// Linear forward advance only — past milestones show as ticked, future
// ones are disabled until the chain reaches them.

export default function MilestoneAdvancer({
  trackingId,
  templateId,
  state,
  currentMilestoneKey,
  milestonesCompleted,
  onAdvanced,
}: MilestoneAdvancerProps) {
  const [template, setTemplate] = React.useState<TemplateResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/tracking-templates/${templateId}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error?.message ?? 'Failed to load template');
          return;
        }
        setTemplate(json.data);
      } catch {
        if (!cancelled) setError('Network error loading template');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const completedKeys = React.useMemo(
    () => new Set(milestonesCompleted.map((m) => m.key)),
    [milestonesCompleted],
  );

  async function advance(milestoneKey: string) {
    setBusyKey(milestoneKey);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/tracking/${trackingId}/advance-milestone`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ milestoneKey }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Advance failed');
        return;
      }
      await onAdvanced();
    } finally {
      setBusyKey(null);
    }
  }

  // The "next" milestone the user can mark — the first one in the ordered
  // chain that's strictly after the current. Templates always render the
  // full chain; only this row's button is enabled.
  const nextMilestoneKey = React.useMemo(() => {
    if (!template) return null;
    if (state !== 'in_progress') return null;
    if (!currentMilestoneKey) return template.milestones[0]?.key ?? null;
    const currentIdx = template.milestones.findIndex(
      (m) => m.key === currentMilestoneKey,
    );
    return template.milestones[currentIdx + 1]?.key ?? null;
  }, [template, currentMilestoneKey, state]);

  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Milestones
        </div>
        {template && (
          <div className="text-xs text-slate-400">
            {template.name}
          </div>
        )}
      </div>

      {loading && <div className="text-sm text-slate-500">Loading template…</div>}

      {error && (
        <div className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {template && (
        <ol className="space-y-2">
          {template.milestones.map((m) => {
            const isCompleted = completedKeys.has(m.key);
            const isCurrent = m.key === currentMilestoneKey;
            const isNext = m.key === nextMilestoneKey;
            const isBusy = busyKey === m.key;

            return (
              <li
                key={m.key}
                className={
                  'flex items-center gap-3 rounded-md border p-2 ' +
                  (isCompleted
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : isCurrent
                      ? 'border-primary-200 bg-primary-50/40'
                      : 'border-slate-200 bg-white')
                }
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500">
                  {isCompleted ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : isCurrent ? (
                    <ChevronRight className="h-4 w-4 text-primary-600" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                </div>
                <div className="flex-1 text-sm">
                  <div className="font-medium text-slate-900">{m.label}</div>
                  <div className="text-xs text-slate-500">
                    <code>{m.key}</code> · order {m.order}
                  </div>
                </div>
                {isNext && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => advance(m.key)}
                  >
                    {isBusy ? 'Marking…' : 'Mark complete'}
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {template && state !== 'in_progress' && (
        <p className="mt-3 text-xs text-slate-500">
          Milestones can only be advanced while the tracking run is{' '}
          <code>in_progress</code>. Current state:{' '}
          <span className="font-medium">{state}</span>.
        </p>
      )}
    </div>
  );
}
