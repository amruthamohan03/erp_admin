import { eq, sql } from 'drizzle-orm';
import {
  workflowMaster,
  workflowTransitionMaster,
  type WorkflowTransitionMasterInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Tracking lifecycle workflow:
//
//   initiated  ──start────▶  in_progress  ──complete──▶  completed
//        │                         │
//        └──cancel──▶ cancelled    └──cancel──▶ cancelled
//
// `start` stamps started_at via the set_field action; `complete` stamps
// completed_at. Per-milestone advancement inside in_progress is owned by a
// separate /advance-milestone endpoint that bumps current_milestone_key +
// appends to milestones_completed_json — keeping it off the case-runtime's
// state machine lets the template's milestones_json change without
// rewriting workflow transitions.

const WORKFLOW_KEY = 'tracking_default';

export async function seedTrackingWorkflow(db: Database | Transaction): Promise<void> {
  await db
    .insert(workflowMaster)
    .values({
      workflowKey: WORKFLOW_KEY,
      name: 'Tracking (default workflow)',
      description: 'Standard tracking lifecycle from initiated through completed.',
      entityType: 'tracking',
      initialState: 'initiated',
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
  if (!wf) throw new Error(`seedTrackingWorkflow: workflow '${WORKFLOW_KEY}' not found`);

  const transitions: WorkflowTransitionMasterInsert[] = [
    {
      workflowId: wf.id,
      transitionKey: 'start',
      fromState: 'initiated',
      toState: 'in_progress',
      actionJson: [
        { type: 'set_field', field: 'started_at', value: { var: 'now' } },
      ],
    },
    {
      workflowId: wf.id,
      transitionKey: 'complete',
      fromState: 'in_progress',
      toState: 'completed',
      actionJson: [
        { type: 'set_field', field: 'completed_at', value: { var: 'now' } },
      ],
    },
    { workflowId: wf.id, transitionKey: 'cancel_from_initiated',   fromState: 'initiated',   toState: 'cancelled' },
    { workflowId: wf.id, transitionKey: 'cancel_from_in_progress', fromState: 'in_progress', toState: 'cancelled' },
  ];

  await db
    .delete(workflowTransitionMaster)
    .where(eq(workflowTransitionMaster.workflowId, wf.id));
  await db.insert(workflowTransitionMaster).values(transitions);
}
