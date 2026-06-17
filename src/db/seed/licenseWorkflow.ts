import { eq, sql } from 'drizzle-orm';
import {
  ruleMaster,
  workflowMaster,
  workflowTransitionMaster,
  type WorkflowTransitionMasterInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// License workflow:
//
//   draft  ──submit──▶  submitted  ──approve──▶  approved  ──issue──▶  issued
//     ▲                     │                       │
//     └─────reject──────────┘                       │
//     │                     │                       │
//     ├──cancel──▶ cancelled                        │
//                             ◀──────cancel─────────┘
//
// The `approve` transition is gated by license.no_self_approve and writes
// the approved_by field via a set_field action.

const WORKFLOW_KEY = 'license_default';

export async function seedLicenseWorkflow(db: Database | Transaction): Promise<void> {
  await db
    .insert(workflowMaster)
    .values({
      workflowKey: WORKFLOW_KEY,
      name: 'License (default workflow)',
      description: 'Standard import/export license lifecycle.',
      entityType: 'license',
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
  if (!wf) {
    throw new Error(`seedLicenseWorkflow: workflow '${WORKFLOW_KEY}' not found`);
  }

  const [noSelfApprove] = await db
    .select({ id: ruleMaster.id })
    .from(ruleMaster)
    .where(eq(ruleMaster.ruleKey, 'license.no_self_approve'))
    .limit(1);
  if (!noSelfApprove) {
    throw new Error(
      'seedLicenseWorkflow: rule license.no_self_approve missing — run seedLicenseRules first',
    );
  }

  const transitions: WorkflowTransitionMasterInsert[] = [
    {
      workflowId: wf.id,
      transitionKey: 'submit',
      fromState: 'draft',
      toState: 'submitted',
    },
    {
      workflowId: wf.id,
      transitionKey: 'approve',
      fromState: 'submitted',
      toState: 'approved',
      ruleId: noSelfApprove.id,
      actionJson: [
        {
          type: 'set_field',
          field: 'approved_by',
          value: { var: 'actor.userId' },
        },
      ],
    },
    {
      workflowId: wf.id,
      transitionKey: 'reject',
      fromState: 'submitted',
      toState: 'draft',
    },
    {
      workflowId: wf.id,
      transitionKey: 'issue',
      fromState: 'approved',
      toState: 'issued',
    },
    {
      workflowId: wf.id,
      transitionKey: 'cancel_from_draft',
      fromState: 'draft',
      toState: 'cancelled',
    },
    {
      workflowId: wf.id,
      transitionKey: 'cancel_from_submitted',
      fromState: 'submitted',
      toState: 'cancelled',
    },
    {
      workflowId: wf.id,
      transitionKey: 'cancel_from_approved',
      fromState: 'approved',
      toState: 'cancelled',
    },
  ];

  // workflow_transition_master_t doesn't have a (workflow_id, transition_key)
  // unique constraint, so delete+reinsert the whole set for deterministic
  // seeding. Same caveat as the form-fields seed.
  await db
    .delete(workflowTransitionMaster)
    .where(eq(workflowTransitionMaster.workflowId, wf.id));
  await db.insert(workflowTransitionMaster).values(transitions);
}
