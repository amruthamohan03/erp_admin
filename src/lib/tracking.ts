import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { trackingT, trackingTemplateMaster } from '@/db/schema';
import {
  orderedMilestones,
  type TrackingMilestone,
} from '@/lib/trackingTemplates';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '@/lib/errors';

// Per-milestone advancement for tracking_t — the second half of §2 step 3.
//
// The case-runtime workflow handles the top-level lifecycle
// (initiated → in_progress → completed). Inside in_progress, this module
// owns current_milestone_key + milestones_completed_json. Keeping it off
// the case-runtime means each tracking_template_master_t.milestones_json
// can change without rewriting workflow transitions.
//
// Rules enforced:
//   - tracking must be in state 'in_progress' before any milestone advance
//   - milestone_key must exist in the run's template
//   - milestone_key must come strictly after the current milestone by
//     `order` (linear forward advance — skipping forward is fine, going
//     back isn't)
//   - milestones_completed_json is append-only — never rewritten
//
// Returns the new state slice; callers can re-fetch the full case-runtime
// view if they want available transitions.

export const completedMilestoneSchema = z.object({
  key: z.string().min(1).max(50),
  completedAt: z.string(),
  completedBy: z.number().int(),
});

export const completedMilestonesSchema = z.array(completedMilestoneSchema);

export type CompletedMilestone = z.infer<typeof completedMilestoneSchema>;

/**
 * Validate a milestones_completed_json blob. Empty array on null/undefined.
 * Used by callers (UI + tests) that need to read the column shape.
 */
export function parseCompletedMilestones(value: unknown): CompletedMilestone[] {
  if (value == null) return [];
  return completedMilestonesSchema.parse(value);
}

function findMilestone(
  milestones: TrackingMilestone[],
  key: string,
): TrackingMilestone {
  const m = milestones.find((x) => x.key === key);
  if (!m) {
    throw new BadRequestError(
      `Milestone '${key}' isn't in this tracking run's template`,
    );
  }
  return m;
}

/**
 * Enforce the "linear forward advance" rule against a template's ordered
 * milestones. Throws BadRequestError if either key is unknown to the
 * template, ConflictError if `targetKey` doesn't come strictly after
 * `currentKey` by `order`. `currentKey: null` means "no milestones yet";
 * any in-template target is valid in that state.
 *
 * Pure — no I/O. The DB read + write happen in advanceTrackingMilestone.
 */
export function validateMilestoneAdvance(
  milestones: TrackingMilestone[],
  currentKey: string | null,
  targetKey: string,
): TrackingMilestone {
  const target = findMilestone(milestones, targetKey);
  if (currentKey == null) return target;
  const current = findMilestone(milestones, currentKey);
  if (target.order <= current.order) {
    throw new ConflictError(
      `Milestone '${targetKey}' (order ${target.order}) doesn't come ` +
        `after the current '${current.key}' (order ${current.order})`,
    );
  }
  return target;
}

export interface AdvanceTrackingMilestoneArgs {
  trackingId: number;
  milestoneKey: string;
  actorUserId: number;
}

export interface AdvanceTrackingMilestoneResult {
  trackingId: number;
  state: string;
  currentMilestoneKey: string;
  milestonesCompleted: CompletedMilestone[];
  /** True when the just-completed milestone was the last in the template. */
  isFinalMilestone: boolean;
}

/**
 * Mark `milestoneKey` as completed on tracking row `trackingId`. Linear
 * forward advance only — `milestoneKey` must come strictly after the run's
 * current milestone by template order.
 *
 * Auto-completing the tracking row to state='completed' on the final
 * milestone is *not* done here. `isFinalMilestone` lets the caller decide
 * whether to also invoke the workflow's `complete` transition.
 */
export async function advanceTrackingMilestone({
  trackingId,
  milestoneKey,
  actorUserId,
}: AdvanceTrackingMilestoneArgs): Promise<AdvanceTrackingMilestoneResult> {
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(trackingT)
      .where(eq(trackingT.id, trackingId))
      .limit(1);
    if (!row) {
      throw new NotFoundError(`Tracking ${trackingId} not found`);
    }

    if (row.state !== 'in_progress') {
      throw new ConflictError(
        `Tracking ${trackingId} must be in state 'in_progress' to advance ` +
          `a milestone (currently '${row.state}')`,
      );
    }

    // Load the template by id — we already have the FK on the row. No need
    // to bounce through templateKey via loadTrackingTemplate.
    const [template] = await tx
      .select({ milestonesJson: trackingTemplateMaster.milestonesJson })
      .from(trackingTemplateMaster)
      .where(eq(trackingTemplateMaster.id, row.templateId))
      .limit(1);
    if (!template) {
      throw new NotFoundError(`Tracking template ${row.templateId} not found`);
    }
    const milestones = orderedMilestones(template.milestonesJson);
    const target = validateMilestoneAdvance(
      milestones,
      row.currentMilestoneKey,
      milestoneKey,
    );

    const completed = parseCompletedMilestones(row.milestonesCompletedJson);
    completed.push({
      key: target.key,
      completedAt: new Date().toISOString(),
      completedBy: actorUserId,
    });

    await tx
      .update(trackingT)
      .set({
        currentMilestoneKey: target.key,
        milestonesCompletedJson: completed,
        updatedBy: actorUserId,
        updatedAt: sql`now()`,
      })
      .where(eq(trackingT.id, trackingId));

    const last = milestones[milestones.length - 1];
    const isFinalMilestone = last?.key === target.key;

    return {
      trackingId,
      state: row.state,
      currentMilestoneKey: target.key,
      milestonesCompleted: completed,
      isFinalMilestone,
    };
  });
}
