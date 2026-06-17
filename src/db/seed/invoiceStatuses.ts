import { sql } from 'drizzle-orm';
import { statusMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Invoice lifecycle states. Match invoice_default workflow's transitions
// in src/db/seed/invoiceWorkflow.ts.
//
//   draft → submitted → issued → paid       (happy path)
//   {draft, submitted, issued} → cancelled  (escape hatch)

const rows = [
  { statusKey: 'draft',     name: 'Draft',     entityType: 'invoice', color: 'secondary', badge: 'Draft',     isFinal: false, displayOrder: 10 },
  { statusKey: 'submitted', name: 'Submitted', entityType: 'invoice', color: 'info',      badge: 'Submitted', isFinal: false, displayOrder: 20 },
  { statusKey: 'issued',    name: 'Issued',    entityType: 'invoice', color: 'primary',   badge: 'Issued',    isFinal: false, displayOrder: 30 },
  { statusKey: 'paid',      name: 'Paid',      entityType: 'invoice', color: 'success',   badge: 'Paid',      isFinal: true,  displayOrder: 40 },
  { statusKey: 'cancelled', name: 'Cancelled', entityType: 'invoice', color: 'danger',    badge: 'Cancelled', isFinal: true,  displayOrder: 50 },
];

export async function seedInvoiceStatuses(db: Database | Transaction): Promise<void> {
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
