import { eq, sql } from 'drizzle-orm';
import {
  workflowMaster,
  workflowTransitionMaster,
  type WorkflowTransitionMasterInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Credit note workflow:
//
//   draft  ──submit──▶  submitted  ──approve──▶  approved  ──apply──▶  applied
//     ▲                     │                       │
//     └──reject─────────────┘                       │
//     │                     │                       │
//     ├──cancel──▶ cancelled                        │
//                              ◀──────cancel────────┘
//
// `apply` stamps applied_at via { var: 'now' } — same idiom as
// invoice_t.paid_at on the 'mark_paid' transition.
//
// No approval hierarchy gate yet. Payment Request demonstrates how to wire
// the 'approval' action type (src/db/seed/paymentRequestWorkflow.ts) — a
// follow-up can add it here once finance + accounting roles are seeded.

const WORKFLOW_KEY = 'credit_note_default';

export async function seedCreditNoteWorkflow(db: Database | Transaction): Promise<void> {
  await db
    .insert(workflowMaster)
    .values({
      workflowKey: WORKFLOW_KEY,
      name: 'Credit note (default workflow)',
      description: 'Standard credit-note lifecycle from draft through applied.',
      entityType: 'credit_note',
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
  if (!wf) throw new Error(`seedCreditNoteWorkflow: workflow '${WORKFLOW_KEY}' not found`);

  const transitions: WorkflowTransitionMasterInsert[] = [
    { workflowId: wf.id, transitionKey: 'submit',  fromState: 'draft',     toState: 'submitted' },
    { workflowId: wf.id, transitionKey: 'reject',  fromState: 'submitted', toState: 'draft' },
    { workflowId: wf.id, transitionKey: 'approve', fromState: 'submitted', toState: 'approved' },
    {
      workflowId: wf.id,
      transitionKey: 'apply',
      fromState: 'approved',
      toState: 'applied',
      actionJson: [
        { type: 'set_field', field: 'applied_at', value: { var: 'now' } },
      ],
    },
    { workflowId: wf.id, transitionKey: 'cancel_from_draft',     fromState: 'draft',     toState: 'cancelled' },
    { workflowId: wf.id, transitionKey: 'cancel_from_submitted', fromState: 'submitted', toState: 'cancelled' },
    { workflowId: wf.id, transitionKey: 'cancel_from_approved',  fromState: 'approved',  toState: 'cancelled' },
  ];

  await db
    .delete(workflowTransitionMaster)
    .where(eq(workflowTransitionMaster.workflowId, wf.id));
  await db.insert(workflowTransitionMaster).values(transitions);
}
