import { sql } from 'drizzle-orm';
import { approvalHierarchyMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Approval hierarchy for payment_request_default. Three stages:
//   level 1 — Department Head
//   level 2 — Finance Manager
//   level 3 — CEO
//
// All seeded role_ids default to 1 (the bootstrap admin role) so a fresh
// install can drive the workflow end-to-end with one user. Real
// deployments edit this row to point each stage at the right org role —
// the workflow doesn't change, only the hierarchy data.

const HIERARCHY_KEY = 'payment_request_default';

const rows = [
  {
    hierarchyKey: HIERARCHY_KEY,
    name: 'Payment request — default chain',
    description:
      'Department Head → Finance Manager → CEO. Adjust role_ids per project.',
    entityType: 'payment_request',
    stagesJson: [
      { role_id: 1, level: 1, label: 'Department Head' },
      { role_id: 1, level: 2, label: 'Finance Manager' },
      { role_id: 1, level: 3, label: 'CEO' },
    ],
  },
];

export async function seedPaymentRequestApprovals(
  db: Database | Transaction,
): Promise<void> {
  await db
    .insert(approvalHierarchyMaster)
    .values(rows)
    .onConflictDoUpdate({
      target: approvalHierarchyMaster.hierarchyKey,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        entityType: sql`excluded.entity_type`,
        stagesJson: sql`excluded.stages_json`,
        updatedAt: sql`now()`,
      },
    });
}
