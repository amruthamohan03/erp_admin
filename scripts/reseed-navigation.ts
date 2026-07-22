import { sql } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import { seedMenus } from '@/db/seed/menus';
import { menuMaster, roleMenuMapping } from '@/db/schema';

// One-off: after cloning the DB from main, menu_master_t holds MAIN's
// sidebar URLs (clients/, import/index, masters/roles/index, plus
// main-only items) which 404 on the restructure routes. This:
//   1) clears the menu + its grants,
//   2) reseeds the authoritative restructure sidebar (correct /… URLs,
//      re-grants Super Admin role_id=1) from src/db/seed/menus.ts,
//   3) prunes items whose pages were removed in the Stage-5 cleanup,
//      plus any parent groups left empty.
const REMOVED_ROUTES = [
  '/reports',
  '/tracking',
  '/credit-notes',
  '/invoices',
  '/payment-requests',
  '/fiche-de-calcul',
  '/masters/forms',
  '/masters/partials',
  '/masters/payment-types',
  '/masters/payment-subtypes',
  '/mapping/fieldgrants',
  '/exports/dashboard',
  '/imports/dashboard',
  '/licenses/dashboard',
  '/quotations/dashboard',
];

async function main(): Promise<void> {
  await db.delete(roleMenuMapping);
  await db.delete(menuMaster);
  await seedMenus(db);

  // 3) prune removed-feature leaves (role grants cascade), then empty parents.
  await db.execute(
    sql`DELETE FROM menu_master_t WHERE url IN (${sql.join(
      REMOVED_ROUTES.map((u) => sql`${u}`),
      sql`, `,
    )})`,
  );
  await db.execute(
    sql`DELETE FROM menu_master_t p WHERE p.menu_id IS NULL AND p.url = '#'
        AND NOT EXISTS (SELECT 1 FROM menu_master_t c WHERE c.menu_id = p.id)`,
  );

  const rows = await db.select({ id: menuMaster.id }).from(menuMaster);
  console.log(`✓ menu reseeded + pruned (${rows.length} rows)`);
}

main()
  .catch((err) => {
    console.error('reseed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
