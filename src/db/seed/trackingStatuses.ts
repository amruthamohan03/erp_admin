import { sql } from 'drizzle-orm';
import { statusMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Tracking lifecycle states. Match tracking_default workflow's transitions
// in src/db/seed/trackingWorkflow.ts.
//
//   initiated → in_progress → completed     (happy path)
//   {initiated, in_progress} → cancelled    (escape hatch)
//
// Per-milestone advancement (current_milestone_key bumps inside in_progress)
// is a follow-up slice owned by a future /advance-milestone endpoint —
// status changes here gate only the top-level lifecycle.

const rows = [
  { statusKey: 'initiated',   name: 'Initiated',   entityType: 'tracking', color: 'secondary', badge: 'Initiated',   isFinal: false, displayOrder: 10 },
  { statusKey: 'in_progress', name: 'In progress', entityType: 'tracking', color: 'info',      badge: 'In progress', isFinal: false, displayOrder: 20 },
  { statusKey: 'completed',   name: 'Completed',   entityType: 'tracking', color: 'success',   badge: 'Completed',   isFinal: true,  displayOrder: 30 },
  { statusKey: 'cancelled',   name: 'Cancelled',   entityType: 'tracking', color: 'danger',    badge: 'Cancelled',   isFinal: true,  displayOrder: 40 },
];

export async function seedTrackingStatuses(db: Database | Transaction): Promise<void> {
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
