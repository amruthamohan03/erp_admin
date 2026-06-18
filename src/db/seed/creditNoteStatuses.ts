import { sql } from 'drizzle-orm';
import { statusMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Credit note lifecycle states. Match credit_note_default workflow's
// transitions in src/db/seed/creditNoteWorkflow.ts.
//
//   draft → submitted → approved → applied        (happy path)
//   {draft, submitted, approved} → cancelled      (escape hatch)
//   submitted → draft                              (reject back for edits)

const rows = [
  { statusKey: 'draft',     name: 'Draft',     entityType: 'credit_note', color: 'secondary', badge: 'Draft',     isFinal: false, displayOrder: 10 },
  { statusKey: 'submitted', name: 'Submitted', entityType: 'credit_note', color: 'info',      badge: 'Submitted', isFinal: false, displayOrder: 20 },
  { statusKey: 'approved',  name: 'Approved',  entityType: 'credit_note', color: 'primary',   badge: 'Approved',  isFinal: false, displayOrder: 30 },
  { statusKey: 'applied',   name: 'Applied',   entityType: 'credit_note', color: 'success',   badge: 'Applied',   isFinal: true,  displayOrder: 40 },
  { statusKey: 'cancelled', name: 'Cancelled', entityType: 'credit_note', color: 'danger',    badge: 'Cancelled', isFinal: true,  displayOrder: 50 },
];

export async function seedCreditNoteStatuses(db: Database | Transaction): Promise<void> {
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
