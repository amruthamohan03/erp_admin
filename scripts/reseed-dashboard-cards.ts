import { db, pool } from '@/lib/db';
import { seedDashboardCards } from '@/db/seed/dashboardCards';
import { dashboardCardMaster, roleDashboardCardMapping } from '@/db/schema';

// One-off: the DB was cloned from main, so dashboard_card_master_t holds
// MAIN's card_url / data_source values (main paths + /api/... sources).
// Clear and reseed restructure's authoritative dashboard cards, which
// also re-grants them to the Super Admin (role_id=1).
async function main(): Promise<void> {
  await db.delete(roleDashboardCardMapping);
  await db.delete(dashboardCardMaster);
  await seedDashboardCards(db);
  const rows = await db.select({ id: dashboardCardMaster.id }).from(dashboardCardMaster);
  console.log(`✓ dashboard cards reseeded from restructure spec (${rows.length} cards)`);
}

main()
  .catch((err) => {
    console.error('reseed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
