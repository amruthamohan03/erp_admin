import { eq, sql } from 'drizzle-orm';
import {
  workflowMaster,
  workflowTransitionMaster,
  type WorkflowTransitionMasterInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// payment_request_default workflow.
//
//   draft ──submit──▶ submitted
//                       │
//                       ├──approve_l1──▶ level_1_approved
//                       │                  │
//                       │                  ├──approve_l2──▶ level_2_approved
//                       │                  │                  │
//                       │                  │                  ├──approve_l3──▶ fully_approved ──mark_paid──▶ paid
//                       │                  │                  │
//                       │                  │                  └──reject_l3──▶ rejected
//                       │                  │
//                       │                  └──reject_l2──▶ rejected
//                       │
//                       └──reject_l1──▶ rejected
//
//   draft / submitted ──cancel──▶ cancelled
//
// Every approve_l* transition carries TWO actions:
//   1. { type: 'approval', hierarchyKey: 'payment_request_default', level: N }
//      — engine loads the hierarchy + runs canApproveAtLevel against
//      actor.roleId; ForbiddenError on miss aborts before any write.
//   2. { type: 'set_field', field: 'current_approval_level', value: N }
//      — bumps the entity column so listTransitions / UI can show "approved
//      to level N" without parsing the state string.
//
// approve_l3 also sets approved_at via { var: 'now' }; mark_paid sets
// paid_at the same way.

const WORKFLOW_KEY = 'payment_request_default';

export async function seedPaymentRequestWorkflow(
  db: Database | Transaction,
): Promise<void> {
  await db
    .insert(workflowMaster)
    .values({
      workflowKey: WORKFLOW_KEY,
      name: 'Payment request (default workflow)',
      description: 'Three-stage approval: Department Head → Finance → CEO.',
      entityType: 'payment_request',
      initialState: 'draft',
    })
    .onConflictDoUpdate({
      target: workflowMaster.workflowKey,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        entityType: sql`excluded.entity_type`,
        initialState: sql`excluded.initial_state`,
        updatedAt: sql`now()`,
      },
    });

  const [wf] = await db
    .select({ id: workflowMaster.id })
    .from(workflowMaster)
    .where(eq(workflowMaster.workflowKey, WORKFLOW_KEY))
    .limit(1);
  if (!wf) throw new Error(`seedPaymentRequestWorkflow: '${WORKFLOW_KEY}' missing`);

  const transitions: WorkflowTransitionMasterInsert[] = [
    { workflowId: wf.id, transitionKey: 'submit',     fromState: 'draft',             toState: 'submitted'        },
    { workflowId: wf.id, transitionKey: 'cancel',     fromState: 'draft',             toState: 'cancelled'        },
    { workflowId: wf.id, transitionKey: 'cancel',     fromState: 'submitted',         toState: 'cancelled'        },

    {
      workflowId: wf.id,
      transitionKey: 'approve_l1',
      fromState: 'submitted',
      toState: 'level_1_approved',
      actionJson: [
        { type: 'approval', hierarchyKey: 'payment_request_default', level: 1 },
        { type: 'set_field', field: 'current_approval_level', value: 1 },
      ],
    },
    { workflowId: wf.id, transitionKey: 'reject_l1', fromState: 'submitted', toState: 'rejected' },

    {
      workflowId: wf.id,
      transitionKey: 'approve_l2',
      fromState: 'level_1_approved',
      toState: 'level_2_approved',
      actionJson: [
        { type: 'approval', hierarchyKey: 'payment_request_default', level: 2 },
        { type: 'set_field', field: 'current_approval_level', value: 2 },
      ],
    },
    { workflowId: wf.id, transitionKey: 'reject_l2', fromState: 'level_1_approved', toState: 'rejected' },

    {
      workflowId: wf.id,
      transitionKey: 'approve_l3',
      fromState: 'level_2_approved',
      toState: 'fully_approved',
      actionJson: [
        { type: 'approval', hierarchyKey: 'payment_request_default', level: 3 },
        { type: 'set_field', field: 'current_approval_level', value: 3 },
        { type: 'set_field', field: 'approved_at', value: { var: 'now' } },
      ],
    },
    { workflowId: wf.id, transitionKey: 'reject_l3', fromState: 'level_2_approved', toState: 'rejected' },

    {
      workflowId: wf.id,
      transitionKey: 'mark_paid',
      fromState: 'fully_approved',
      toState: 'paid',
      actionJson: [
        { type: 'set_field', field: 'paid_at', value: { var: 'now' } },
      ],
    },
  ];

  await db
    .delete(workflowTransitionMaster)
    .where(eq(workflowTransitionMaster.workflowId, wf.id));
  await db.insert(workflowTransitionMaster).values(transitions);
}
