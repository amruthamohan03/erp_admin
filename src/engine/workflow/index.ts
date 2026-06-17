import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  workflowMaster,
  workflowTransitionMaster,
  type WorkflowMasterRow,
  type WorkflowTransitionMasterRow,
} from '@/db/schema';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { applyRule, loadRuleById } from '@/engine/rules';
import {
  applyApprovalGates,
  collectFieldUpdates,
  parseActions,
  sideEffectDescriptors,
  type Action,
  type SideEffectDescriptor,
} from './actions';

export * from './actions';

// Workflow engine per root CLAUDE.md §4.6.
//
// `workflowKey` is the stable string from workflow_master_t.workflow_key
// (e.g. 'license', 'payment_request'). Code looks workflows up by key; ids
// drift across deployments. Same convention as the rule engine (§4.2).
//
// Transition lifecycle (as wired today):
//   1. Resolve workflow + transition by key.
//   2. If transition.rule_id is set, evaluate the gate rule against the rule
//      context — falsy throws ForbiddenError. (JSON Logic, §4.2.)
//   3. Parse transition.action_json into typed Action[].
//   4. Apply approval gates — any `approval` action loads its hierarchy and
//      throws ForbiddenError if the actor's role can't grant the named level.
//      Runs before patch / side-effect collection so a denied approval never
//      writes anything to the entity.
//   5. Collect a field-patch from `set_field` actions, evaluating each value
//      via applyRule so rules can read entity / actor / payload / now.
//   6. Collect side-effect descriptors (notify, …) for the caller to dispatch
//      after its UPDATE commits.
//
// executeTransition returns the **execution plan** rather than writing —
// case-runtime (src/modules/case-runtime/) owns the target_table identity
// and is the right layer to splice the patch + new state into a single
// dynamic UPDATE via Drizzle's sql template tag (§7.3 / §7.6).

export interface WorkflowWithTransitions extends WorkflowMasterRow {
  transitions: WorkflowTransitionMasterRow[];
}

/**
 * The shape rule_json expressions and action `value` / `to` fields see when
 * a workflow transition fires. A rule like `{ ">": [{ "var": "entity.amount" }, 1000] }`
 * reads `context.entity.amount` from this object. Keep the keys stable —
 * they're part of the master-configured rule contract.
 */
export interface TransitionContext {
  /** The entity row being transitioned (license, invoice, …). */
  entity: Record<string, unknown>;
  /** Caller identity for audit + rule evaluation. */
  actorUserId: number;
  /**
   * Caller's role_id. Used by `approval` actions to check canApproveAtLevel
   * and surfaced to rule_json as `{ var: "actor.roleId" }`.
   */
  actorRoleId: number;
  /** Free-form extra inputs (form data, request body, …). */
  payload?: Record<string, unknown>;
}

export interface ExecutedTransition {
  workflowKey: string;
  transitionKey: string;
  fromState: string;
  toState: string;
  /** Field updates to splice into the UPDATE that writes the new state. */
  patch: Record<string, unknown>;
  /** Side effects to dispatch after the caller's UPDATE commits. */
  sideEffects: SideEffectDescriptor[];
  /** The parsed action list, exposed for tooling / audit. */
  actions: Action[];
}

export async function loadWorkflow(workflowKey: string): Promise<WorkflowWithTransitions> {
  const [workflow] = await db
    .select()
    .from(workflowMaster)
    .where(and(eq(workflowMaster.workflowKey, workflowKey), eq(workflowMaster.display, 'Y')))
    .limit(1);
  if (!workflow) throw new NotFoundError(`Workflow not found: ${workflowKey}`);

  const transitions = await db
    .select()
    .from(workflowTransitionMaster)
    .where(
      and(
        eq(workflowTransitionMaster.workflowId, workflow.id),
        eq(workflowTransitionMaster.display, 'Y'),
      ),
    )
    .orderBy(asc(workflowTransitionMaster.id));

  return { ...workflow, transitions };
}

export async function listTransitions(
  workflowKey: string,
  fromState: string,
): Promise<WorkflowTransitionMasterRow[]> {
  const workflow = await loadWorkflow(workflowKey);
  return workflow.transitions.filter((t) => t.fromState === fromState);
}

export function buildRuleContext(
  context: TransitionContext,
  now: string = new Date().toISOString(),
): Record<string, unknown> {
  // `now` is an ISO 8601 timestamp computed once per transition so every
  // set_field action sees the same value (atomic). Override at the call
  // site for deterministic tests.
  return {
    entity: context.entity,
    actor: { userId: context.actorUserId, roleId: context.actorRoleId },
    payload: context.payload ?? {},
    now,
  };
}

export async function executeTransition(
  workflowKey: string,
  transitionKey: string,
  context: TransitionContext,
): Promise<ExecutedTransition> {
  const workflow = await loadWorkflow(workflowKey);
  const transition = workflow.transitions.find((t) => t.transitionKey === transitionKey);
  if (!transition) {
    throw new NotFoundError(`Transition not found: ${workflowKey}/${transitionKey}`);
  }

  const ruleContext = buildRuleContext(context);

  // Rule gate (§4.2). Falsy → blocked.
  if (transition.ruleId != null) {
    const rule = await loadRuleById(transition.ruleId);
    const allowed = applyRule(rule.ruleJson, ruleContext);
    if (!allowed) {
      throw new ForbiddenError(
        `Transition gate denied: ${workflowKey}/${transitionKey} (rule "${rule.ruleKey}")`,
      );
    }
  }

  const actions = parseActions(transition.actionJson);

  // Approval gates — any `approval` action loads its hierarchy and checks
  // canApproveAtLevel against the actor's role. Throws ForbiddenError on
  // miss, which aborts the transition before any state is written.
  await applyApprovalGates(actions, ruleContext);

  const patch = collectFieldUpdates(actions, ruleContext);
  const sideEffects = sideEffectDescriptors(actions, ruleContext);

  return {
    workflowKey,
    transitionKey,
    fromState: transition.fromState,
    toState: transition.toState,
    patch,
    sideEffects,
    actions,
  };
}
