import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  trackingTemplateMaster,
  type TrackingTemplateMasterRow,
} from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

// Helpers for tracking_template_master_t per CLAUDE.md §2 step 3.
//
// Pure parsing + queries — the tracking_t transactional table (one row per
// consignment-being-tracked) is a follow-up slice once the column shape
// settles (likely milestones_completed_json or a normalised
// tracking_milestone_event_t).

export const trackingMilestoneSchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(255),
  order: z.number().int().min(0),
});

export const trackingMilestonesSchema = z.array(trackingMilestoneSchema).min(1);

export type TrackingMilestone = z.infer<typeof trackingMilestoneSchema>;

export interface TrackingTemplateWithMilestones
  extends TrackingTemplateMasterRow {
  milestones: TrackingMilestone[];
}

/**
 * Validate the opaque milestones_json blob into a typed array. Throws
 * ZodError on a malformed master row; sorting by `order` is the caller's
 * job (orderedMilestones below) so admins can save in any order.
 */
export function parseMilestones(milestonesJson: unknown): TrackingMilestone[] {
  return trackingMilestonesSchema.parse(milestonesJson);
}

/**
 * Same as parseMilestones but sorted ascending by `order` then `key`
 * (deterministic — ties stay reproducible across loads).
 */
export function orderedMilestones(milestonesJson: unknown): TrackingMilestone[] {
  const parsed = parseMilestones(milestonesJson);
  return [...parsed].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

/**
 * Load a tracking template by stable key with milestones pre-parsed and
 * sorted. NotFoundError if missing or display='N'.
 */
export async function loadTrackingTemplate(
  templateKey: string,
): Promise<TrackingTemplateWithMilestones> {
  const [row] = await db
    .select()
    .from(trackingTemplateMaster)
    .where(
      and(
        eq(trackingTemplateMaster.templateKey, templateKey),
        eq(trackingTemplateMaster.display, 'Y'),
      ),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundError(`Tracking template not found: ${templateKey}`);
  }
  return { ...row, milestones: orderedMilestones(row.milestonesJson) };
}

/**
 * The next milestone after the one with the given key, or undefined when
 * the chain is exhausted. Useful for a "next step" indicator on a tracking
 * detail page.
 */
export function nextMilestone(
  milestones: TrackingMilestone[],
  currentKey: string,
): TrackingMilestone | undefined {
  const idx = milestones.findIndex((m) => m.key === currentKey);
  if (idx === -1) return undefined;
  return milestones[idx + 1];
}

/**
 * Percentage of milestones completed (0-100). `completedKeys` is whatever
 * the tracking_t row records; unknown keys are ignored so renaming a
 * milestone won't crash a progress bar mid-flight.
 */
export function trackingProgress(
  milestones: TrackingMilestone[],
  completedKeys: ReadonlyArray<string>,
): number {
  if (milestones.length === 0) return 0;
  const known = new Set(milestones.map((m) => m.key));
  const hit = completedKeys.filter((k) => known.has(k)).length;
  return Math.round((hit / milestones.length) * 100);
}
