import { sql } from 'drizzle-orm';
import { statusMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Payment request lifecycle states. Match the seeded workflow transitions.
//
//   draft → submitted → level_1_approved → level_2_approved →
//     fully_approved → paid
//   {submitted, level_1_approved, level_2_approved} → rejected
//   {draft, submitted} → cancelled

const rows = [
  { statusKey: 'draft',             name: 'Draft',                    entityType: 'payment_request', color: 'secondary', badge: 'Draft',     isFinal: false, displayOrder: 10 },
  { statusKey: 'submitted',         name: 'Submitted for approval',   entityType: 'payment_request', color: 'info',      badge: 'Submitted', isFinal: false, displayOrder: 20 },
  { statusKey: 'level_1_approved',  name: 'Approved by Dept Head',    entityType: 'payment_request', color: 'info',      badge: 'L1',        isFinal: false, displayOrder: 30 },
  { statusKey: 'level_2_approved',  name: 'Approved by Finance',      entityType: 'payment_request', color: 'info',      badge: 'L2',        isFinal: false, displayOrder: 40 },
  { statusKey: 'fully_approved',    name: 'Approved by CEO',          entityType: 'payment_request', color: 'success',   badge: 'Approved',  isFinal: false, displayOrder: 50 },
  { statusKey: 'paid',              name: 'Paid',                     entityType: 'payment_request', color: 'success',   badge: 'Paid',      isFinal: true,  displayOrder: 60 },
  { statusKey: 'rejected',          name: 'Rejected',                 entityType: 'payment_request', color: 'danger',    badge: 'Rejected',  isFinal: true,  displayOrder: 70 },
  { statusKey: 'cancelled',         name: 'Cancelled',                entityType: 'payment_request', color: 'danger',    badge: 'Cancelled', isFinal: true,  displayOrder: 80 },
];

export async function seedPaymentRequestStatuses(db: Database | Transaction): Promise<void> {
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
