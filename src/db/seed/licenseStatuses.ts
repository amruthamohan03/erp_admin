import { sql } from 'drizzle-orm';
import { statusMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// License lifecycle states. The state names match
// workflow_master_t.initial_state / workflow_transition_master_t.from_state +
// to_state for the license workflow (when those are seeded).
//
//   draft → submitted → approved → issued       (happy path)
//   {draft, submitted, approved} → cancelled    (escape hatch)

const rows = [
  {
    statusKey: 'draft',
    name: 'Draft',
    entityType: 'license',
    color: 'secondary',
    badge: 'Draft',
    isFinal: false,
    displayOrder: 10,
  },
  {
    statusKey: 'submitted',
    name: 'Submitted for review',
    entityType: 'license',
    color: 'info',
    badge: 'Submitted',
    isFinal: false,
    displayOrder: 20,
  },
  {
    statusKey: 'approved',
    name: 'Approved',
    entityType: 'license',
    color: 'success',
    badge: 'Approved',
    isFinal: false,
    displayOrder: 30,
  },
  {
    statusKey: 'issued',
    name: 'Issued',
    entityType: 'license',
    color: 'primary',
    badge: 'Issued',
    isFinal: true,
    displayOrder: 40,
  },
  {
    statusKey: 'cancelled',
    name: 'Cancelled',
    entityType: 'license',
    color: 'danger',
    badge: 'Cancelled',
    isFinal: true,
    displayOrder: 50,
  },
];

export async function seedLicenseStatuses(db: Database | Transaction): Promise<void> {
  await db
    .insert(statusMaster)
    .values(rows)
    .onConflictDoUpdate({
      target: [statusMaster.statusKey, statusMaster.entityType],
      set: {
        name: sql`excluded.name`,
        color: sql`excluded.color`,
        badge: sql`excluded.badge`,
        isFinal: sql`excluded.is_final`,
        displayOrder: sql`excluded.display_order`,
        updatedAt: sql`now()`,
      },
    });
}
