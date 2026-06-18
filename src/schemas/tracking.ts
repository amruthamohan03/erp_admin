import { z } from 'zod';
import {
  completedMilestoneSchema,
  completedMilestonesSchema,
} from '@/lib/tracking';

// Schemas for the tracking advance-milestone endpoint.
// completedMilestoneSchema lives in src/lib/tracking.ts (it's also the
// JSON column shape) — re-exported here so route + UI imports stay in one
// place.

export const advanceMilestoneRequestSchema = z.object({
  milestoneKey: z.string().min(1).max(50),
});

export type AdvanceMilestoneRequest = z.infer<typeof advanceMilestoneRequestSchema>;

export const advanceMilestoneResponseSchema = z.object({
  trackingId: z.number().int(),
  state: z.string(),
  currentMilestoneKey: z.string(),
  milestonesCompleted: completedMilestonesSchema,
  isFinalMilestone: z.boolean(),
});

export { completedMilestoneSchema, completedMilestonesSchema };
