import { z } from 'zod';
import { applyRule } from '@/engine/rules';
import {
  canApproveAtLevel,
  loadApprovalHierarchy,
  type ApprovalStage,
} from '@/lib/approvalHierarchy';
import { ForbiddenError } from '@/lib/errors';

// Action format for workflow_transition_master_t.action_json per CLAUDE.md §4.6.
//
// Each transition row carries an ordered array of typed actions. Three
// action types are currently supported:
//
//   set_field — patches a field on the entity in the same UPDATE that writes
//     the new state. `value` is a JSON Logic expression evaluated against the
//     rule context (entity / actor / payload / now) — so referencing the
//     caller is `{ "var": "actor.userId" }`, a literal is `123`, etc.
//
//   notify — declarative recipient + template. The engine doesn't send mail
//     itself (sending sits inside the caller's transaction); executeTransition
//     returns the descriptor in `sideEffects` and the caller is responsible
//     for dispatching after the DB write commits.
//
//   approval — gates the transition on approval_hierarchy_master_t. Loads
//     the named hierarchy and calls canApproveAtLevel(stages, actor.roleId,
//     level - 1). Throws ForbiddenError on miss — aborts the transition
//     before any state writes. Use one approval action per stage being
//     granted in this transition.
//
// Add new action types by extending the discriminated union below and the
// runtime switch in collectFieldUpdates / sideEffectDescriptors /
// applyApprovalGates.

const setFieldActionSchema = z.object({
  type: z.literal('set_field'),
  field: z.string().min(1).max(100),
  // JSON Logic expression OR a literal value. We validate the value side
  // permissively because json-logic-js accepts both — schema validation
  // catches malformed actions but not malformed JSON Logic.
  value: z.unknown(),
});

const notifyActionSchema = z.object({
  type: z.literal('notify'),
  channel: z.enum(['email', 'sms', 'in_app']),
  // JSON Logic expression resolving to a recipient address / user-id / etc.
  to: z.unknown(),
  template: z.string().min(1).max(100),
});

const approvalActionSchema = z.object({
  type: z.literal('approval'),
  hierarchyKey: z.string().min(1).max(100),
  /**
   * The level being granted (1-based). The check is
   * canApproveAtLevel(stages, actor.roleId, level - 1) — i.e. the actor
   * must be one of the stages at this level.
   */
  level: z.number().int().min(1),
});

const actionSchema = z.discriminatedUnion('type', [
  setFieldActionSchema,
  notifyActionSchema,
  approvalActionSchema,
]);

export const actionsSchema = z.array(actionSchema);

export type SetFieldAction = z.infer<typeof setFieldActionSchema>;
export type NotifyAction = z.infer<typeof notifyActionSchema>;
export type ApprovalAction = z.infer<typeof approvalActionSchema>;
export type Action = z.infer<typeof actionSchema>;

// Parse an action_json blob from the DB. Treats null / undefined / empty
// strings as "no actions"; throws if the shape is malformed so a typo in a
// master row fails noisily rather than silently dropping side effects.
export function parseActions(actionJson: unknown): Action[] {
  if (actionJson == null) return [];
  if (Array.isArray(actionJson) && actionJson.length === 0) return [];
  return actionsSchema.parse(actionJson);
}

/**
 * Walk the actions, evaluate every `set_field` value against the rule
 * context, and produce a `{ field: value }` patch the caller can splice
 * into the entity's UPDATE statement.
 */
export function collectFieldUpdates(
  actions: Action[],
  ruleContext: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const action of actions) {
    if (action.type === 'set_field') {
      patch[action.field] = applyRule(action.value, ruleContext);
    }
  }
  return patch;
}

// Side-effect descriptors — actions whose execution isn't a DB write. The
// caller (case-runtime) decides what to do with these after the UPDATE
// commits: enqueue a job, write to an outbox table, fire-and-forget, etc.
export interface NotifyDescriptor {
  type: 'notify';
  channel: NotifyAction['channel'];
  to: unknown;
  template: string;
}

export type SideEffectDescriptor = NotifyDescriptor;

export function sideEffectDescriptors(
  actions: Action[],
  ruleContext: Record<string, unknown>,
): SideEffectDescriptor[] {
  const out: SideEffectDescriptor[] = [];
  for (const action of actions) {
    if (action.type === 'notify') {
      out.push({
        type: 'notify',
        channel: action.channel,
        to: applyRule(action.to, ruleContext),
        template: action.template,
      });
    }
  }
  return out;
}

// --- Approval gating -----------------------------------------------------

/**
 * Pure gate check. Throws ForbiddenError when the actor can't grant the
 * given level against the supplied stage list. Extracted so tests can
 * exercise the policy without a DB round trip.
 */
export function checkApprovalGate(
  hierarchyKey: string,
  stages: ApprovalStage[],
  actorRoleId: number | undefined,
  level: number,
): void {
  if (typeof actorRoleId !== 'number') {
    throw new ForbiddenError(
      `Approval gate (${hierarchyKey} level ${level}) requires actor.roleId`,
    );
  }
  if (!canApproveAtLevel(stages, actorRoleId, level - 1)) {
    throw new ForbiddenError(
      `Approval denied: role ${actorRoleId} cannot grant ${hierarchyKey} level ${level}`,
    );
  }
}

/**
 * Loop every approval action, load its hierarchy, and call
 * checkApprovalGate. Throws on the first denial — aborts the transition
 * before collectFieldUpdates / sideEffectDescriptors run, so a refused
 * approval never writes to the entity or queues a notification.
 */
export async function applyApprovalGates(
  actions: Action[],
  ruleContext: Record<string, unknown>,
): Promise<void> {
  const approvals = actions.filter(
    (a): a is ApprovalAction => a.type === 'approval',
  );
  if (approvals.length === 0) return;

  const actor = ruleContext.actor as { roleId?: number } | undefined;
  const roleId = actor?.roleId;

  for (const a of approvals) {
    const hierarchy = await loadApprovalHierarchy(a.hierarchyKey);
    checkApprovalGate(a.hierarchyKey, hierarchy.stages, roleId, a.level);
  }
}
