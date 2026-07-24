import { sql } from 'drizzle-orm';
import { paymentStageRole } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// §4.6 — default stage→role map for the Payment Request approval chain.
// A business analyst edits payment_stage_role_master_t to change who approves
// what; nothing is hardcoded in the handlers (§4.7). Super Admin (1) is granted
// on every stage so an admin can drive the whole flow; the other roles mirror
// main's intent, remapped to this project's real roles.
//
// Restructure roles used: 1 Super Admin, 3 Manager, 5 Accounts Officer,
// 10 Cash Cashier, 11 Bank Cashier.
const DEFAULTS: Array<{ stage: string; roleId: number }> = [
  { stage: 'dept', roleId: 3 }, // Manager
  { stage: 'finance', roleId: 5 }, // Accounts Officer
  { stage: 'management', roleId: 1 }, // Super Admin (management sign-off)
  { stage: 'under_process', roleId: 11 }, // Bank Cashier
  { stage: 'paid', roleId: 10 }, // Cash Cashier
  { stage: 'paid', roleId: 11 }, // Bank Cashier
  // Super Admin can act on every stage.
  { stage: 'dept', roleId: 1 },
  { stage: 'finance', roleId: 1 },
  { stage: 'under_process', roleId: 1 },
  { stage: 'paid', roleId: 1 },
];

export async function seedPaymentStageRoles(db: Database | Transaction): Promise<void> {
  await db
    .insert(paymentStageRole)
    .values(DEFAULTS.map((d) => ({ stage: d.stage, roleId: d.roleId, createdBy: 1 })))
    .onConflictDoUpdate({
      target: [paymentStageRole.stage, paymentStageRole.roleId],
      set: { updatedAt: sql`now()` },
    });
}
