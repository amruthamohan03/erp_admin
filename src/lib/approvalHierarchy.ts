import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  approvalHierarchyMaster,
  type ApprovalHierarchyMasterRow,
} from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

// Helpers for approval_hierarchy_master_t per CLAUDE.md §2 step 6.
//
// The master row's stages_json is opaque jsonb; this module is the
// canonical parser + queries. Workflow rules can call canApproveAtLevel
// to gate transitions like "approve_at_finance" against the hierarchy +
// the entity's current_approval_level column.

export const approvalStageSchema = z.object({
  role_id: z.number().int().positive(),
  level: z.number().int().min(1),
  label: z.string().min(1).max(100),
});

export const approvalStagesSchema = z.array(approvalStageSchema).min(1);

export type ApprovalStage = z.infer<typeof approvalStageSchema>;

export interface ApprovalHierarchyWithStages
  extends ApprovalHierarchyMasterRow {
  stages: ApprovalStage[];
}

/**
 * Validate the opaque stages_json blob into a typed array. Throws ZodError
 * on a malformed master row — surfaced to the admin via withErrorHandler
 * during loadApprovalHierarchy.
 */
export function parseStages(stagesJson: unknown): ApprovalStage[] {
  return approvalStagesSchema.parse(stagesJson);
}

/**
 * Load a hierarchy by stable key with stages_json pre-parsed.
 * NotFoundError if missing or display='N'.
 */
export async function loadApprovalHierarchy(
  hierarchyKey: string,
): Promise<ApprovalHierarchyWithStages> {
  const [row] = await db
    .select()
    .from(approvalHierarchyMaster)
    .where(
      and(
        eq(approvalHierarchyMaster.hierarchyKey, hierarchyKey),
        eq(approvalHierarchyMaster.display, 'Y'),
      ),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundError(`Approval hierarchy not found: ${hierarchyKey}`);
  }
  return { ...row, stages: parseStages(row.stagesJson) };
}

/**
 * Stages that sit at `currentLevel + 1` — i.e. who's allowed to do the
 * next approval step. Returns [] when the chain is exhausted (entity is
 * fully approved).
 */
export function nextApprovalStages(
  stages: ApprovalStage[],
  currentLevel: number,
): ApprovalStage[] {
  const nextLevel = currentLevel + 1;
  return stages.filter((s) => s.level === nextLevel);
}

/**
 * Whether a user with the given role can approve from currentLevel up to
 * the next level. Used as the gate predicate on a workflow's approve
 * transition.
 *
 *   canApproveAtLevel(stages, roleId, 0) — true if roleId can grant level-1 approval
 *   canApproveAtLevel(stages, roleId, 1) — true if roleId can grant level-2 approval
 */
export function canApproveAtLevel(
  stages: ApprovalStage[],
  userRoleId: number,
  currentLevel: number,
): boolean {
  const next = nextApprovalStages(stages, currentLevel);
  return next.some((s) => s.role_id === userRoleId);
}

/**
 * The terminal approval level — the highest `level` value in the chain.
 * Useful for "is the entity fully approved?" checks
 * (currentLevel >= maxLevel).
 */
export function maxApprovalLevel(stages: ApprovalStage[]): number {
  return stages.reduce((acc, s) => Math.max(acc, s.level), 0);
}
