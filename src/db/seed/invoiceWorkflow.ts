import { eq, sql } from 'drizzle-orm';
import {
  workflowMaster,
  workflowTransitionMaster,
  type WorkflowTransitionMasterInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Invoice workflow:
//
//   draft  ──submit──▶  submitted  ──issue──▶  issued  ──mark_paid──▶  paid
//     ▲                     │                      │
//     └──reject─────────────┘                      │
//     │                     │                      │
//     ├──cancel──▶ cancelled                       │
//                             ◀──────cancel────────┘
//
// `mark_paid` sets paid_at via the workflow's set_field action with
// { var: 'now' } — the case-runtime's buildRuleContext injects an ISO
// timestamp once per transition.
//
// No rule gates yet (invoice workflow is simpler than license — anyone
// authenticated can advance). A future slice can add a no-self-issue
// rule mirroring no_self_approve once roles are seeded for finance staff.

const WORKFLOW_KEY = 'invoice_default';

export async function seedInvoiceWorkflow(db: Database | Transaction): Promise<void> {
  await db
    .insert(workflowMaster)
    .values({
      workflowKey: WORKFLOW_KEY,
      name: 'Invoice (default workflow)',
      description: 'Standard invoice lifecycle from draft through paid.',
      entityType: 'invoice',
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
  if (!wf) throw new Error(`seedInvoiceWorkflow: workflow '${WORKFLOW_KEY}' not found`);

  const transitions: WorkflowTransitionMasterInsert[] = [
    { workflowId: wf.id, transitionKey: 'submit', fromState: 'draft', toState: 'submitted' },
    { workflowId: wf.id, transitionKey: 'reject', fromState: 'submitted', toState: 'draft' },
    {
      workflowId: wf.id,
      transitionKey: 'issue',
      fromState: 'submitted',
      toState: 'issued',
      actionJson: [
        { type: 'set_field', field: 'issue_date', value: { var: 'now' } },
      ],
    },
    {
      workflowId: wf.id,
      transitionKey: 'mark_paid',
      fromState: 'issued',
      toState: 'paid',
      actionJson: [
        { type: 'set_field', field: 'paid_at', value: { var: 'now' } },
      ],
    },
    { workflowId: wf.id, transitionKey: 'cancel_from_draft', fromState: 'draft', toState: 'cancelled' },
    { workflowId: wf.id, transitionKey: 'cancel_from_submitted', fromState: 'submitted', toState: 'cancelled' },
    { workflowId: wf.id, transitionKey: 'cancel_from_issued', fromState: 'issued', toState: 'cancelled' },
  ];

  // Same delete+reinsert pattern as licenseWorkflow — workflow_transition_master_t
  // has no natural unique on (workflow_id, transition_key).
  await db
    .delete(workflowTransitionMaster)
    .where(eq(workflowTransitionMaster.workflowId, wf.id));
  await db.insert(workflowTransitionMaster).values(transitions);
}
