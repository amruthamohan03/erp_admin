import { db, pool } from '@/lib/db';
import { seedMasters } from '@/db/seed';

// `npm run db:seed` entry point per CLAUDE.md §11.
//
// Applies every master seed in src/db/seed/ in dependency order. Idempotent —
// each table uses .onConflictDoUpdate() on its natural key.
//
// scripts/seed-admin.js (legacy `npm run seed`) is unchanged; that one only
// inserts the bootstrap admin user. Both can be run independently.

async function main(): Promise<void> {
  console.log('Seeding master tables…');
  await seedMasters(db);
  console.log('Master seeds applied.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
