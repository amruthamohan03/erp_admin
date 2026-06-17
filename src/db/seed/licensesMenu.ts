import { eq, sql } from 'drizzle-orm';
import { menuMaster, roleMenuMapping } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Sidebar entry for /licenses + permission grant so it shows up for the
// bootstrap admin role on a fresh install.
//
// menu_master_t doesn't have a unique constraint on `url`, so this seed
// upserts by URL via a manual lookup → update/insert pattern. Adding a
// unique index on `url` would let us onConflictDoUpdate naturally; it's
// a deliberate follow-up since the existing rows (some with url='#')
// would conflict.

const MENU_URL = '/licenses';
const MENU_NAME = 'Licenses';

// Bootstrap admin role id from scripts/seed-admin.js (ADMIN_ROLE_ID = 1).
// Same constant lives there because the admin seed and the master seed
// run independently — keep them in sync if you ever renumber.
const ADMIN_ROLE_ID = 1;

const MENU_DEFAULTS = {
  menuName: MENU_NAME,
  url: MENU_URL,
  menuId: null,        // top-level
  menuLevel: 0,
  menuOrder: 50,
  icon: 'ti ti-file-text',
  text: null,
  badge: null,
  display: 'Y' as const,
};

export async function seedLicensesMenu(db: Database | Transaction): Promise<void> {
  // Find or insert the menu row by URL.
  const [existing] = await db
    .select({ id: menuMaster.id })
    .from(menuMaster)
    .where(eq(menuMaster.url, MENU_URL))
    .limit(1);

  let menuId: number;
  if (existing) {
    await db
      .update(menuMaster)
      .set({
        menuName: MENU_DEFAULTS.menuName,
        icon: MENU_DEFAULTS.icon,
        menuOrder: MENU_DEFAULTS.menuOrder,
        menuLevel: MENU_DEFAULTS.menuLevel,
        menuId: MENU_DEFAULTS.menuId,
        display: MENU_DEFAULTS.display,
        updatedAt: sql`now()`,
      })
      .where(eq(menuMaster.id, existing.id));
    menuId = existing.id;
  } else {
    const [inserted] = await db
      .insert(menuMaster)
      .values(MENU_DEFAULTS)
      .returning({ id: menuMaster.id });
    if (!inserted) throw new Error('seedLicensesMenu: insert returned no row');
    menuId = inserted.id;
  }

  // Grant the admin role all five can_* flags. role_menu_mapping_t has a
  // unique (role_id, menu_id) index — onConflictDoUpdate is honest here.
  await db
    .insert(roleMenuMapping)
    .values({
      roleId: ADMIN_ROLE_ID,
      menuId,
      canView: true,
      canAdd: true,
      canEdit: true,
      canDelete: true,
      canApprove: true,
    })
    .onConflictDoUpdate({
      target: [roleMenuMapping.roleId, roleMenuMapping.menuId],
      set: {
        canView: true,
        canAdd: true,
        canEdit: true,
        canDelete: true,
        canApprove: true,
        updatedAt: sql`now()`,
      },
    });
}
