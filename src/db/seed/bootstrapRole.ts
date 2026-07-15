import { sql } from 'drizzle-orm';
import { roleMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Bootstrap Super Admin role — the one row the whole permission model hangs
// off. scripts/seed-admin.js creates the admin *user* with role_id = 1, and
// seedLicensesMenu (plus every other *Menu seed) grants can_* flags to
// role_id = 1. None of them create the role itself, so on a fresh database
// both the admin-user insert and the menu grants fail their FK to
// role_master_t. This seed fills that gap and must run first in seedMasters().
//
// The id is pinned to 1 to match ADMIN_ROLE_ID in scripts/seed-admin.js and
// src/db/seed/*Menu.ts — keep the three in sync if the bootstrap id ever
// changes. Because we force an explicit id into a serial column, the identity
// sequence isn't advanced by the insert; we setval() it afterwards so the next
// role created through the app doesn't collide on id = 1.

const ADMIN_ROLE_ID = 1;
const ADMIN_ROLE_NAME = 'Super Admin';

export async function seedBootstrapRole(db: Database | Transaction): Promise<void> {
  await db
    .insert(roleMaster)
    .values({ id: ADMIN_ROLE_ID, roleName: ADMIN_ROLE_NAME, display: 'Y' })
    .onConflictDoUpdate({
      target: roleMaster.id,
      set: { roleName: sql`excluded.role_name`, updatedAt: sql`now()` },
    });

  // Keep the serial sequence ahead of the pinned id so app-created roles don't
  // collide with the bootstrap row.
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('role_master_t', 'id'), GREATEST((SELECT max(id) FROM role_master_t), ${ADMIN_ROLE_ID}))`,
  );
}
