import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  workflowMaster,
  workflowTransitionMaster,
  type WorkflowMasterRow,
  type WorkflowTransitionMasterRow,
} from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

// Workflow engine entry points per root CLAUDE.md §4.6.
//
// `workflowKey` is the stable string from workflow_master_t.workflow_key
// (e.g. 'license', 'payment_request'). Code looks workflows up by key; ids
// drift across deployments. Same convention as the rule engine (§4.2).
//
// The actual `executeTransition` body is intentionally not implemented —
// applying a transition needs both a rule evaluator (whose format isn't
// chosen yet) and an action_json schema, both of which deserve their own
// conversation when the first real workflow lands. Today loadWorkflow and
// listTransitions are enough to inspect a workflow from outside the runtime.

export interface WorkflowWithTransitions extends WorkflowMasterRow {
  transitions: WorkflowTransitionMasterRow[];
}

export interface TransitionContext {
  /** The entity row being transitioned (license, invoice, …). */
  entity: Record<string, unknown>;
  /** Caller identity for audit + rule evaluation. */
  actorUserId: number;
  /** Free-form extra inputs (form data, request body, …). */
  payload?: Record<string, unknown>;
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

export async function executeTransition(
  workflowKey: string,
  transitionKey: string,
  _context: TransitionContext,
): Promise<void> {
  const workflow = await loadWorkflow(workflowKey);
  const transition = workflow.transitions.find((t) => t.transitionKey === transitionKey);
  if (!transition) {
    throw new NotFoundError(`Transition not found: ${workflowKey}/${transitionKey}`);
  }
  throw new Error(
    `executeTransition: transition "${workflowKey}/${transitionKey}" resolved but no ` +
      `action_json executor is wired up yet. Pick an action format and implement ` +
      `evaluation in src/engine/workflow/.`,
  );
}
