import { eq, sql } from 'drizzle-orm';
import { menuMaster, roleMenuMapping } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Sidebar entry for /tracking + admin permission grant. Mirrors
// invoicesMenu — see licensesMenu for the upsert-by-URL caveat
// (menu_master_t.url isn't unique).

const MENU_URL = '/tracking';
const MENU_NAME = 'Tracking';
const ADMIN_ROLE_ID = 1;

const MENU_DEFAULTS = {
  menuName: MENU_NAME,
  url: MENU_URL,
  menuId: null,
  menuLevel: 0,
  // 55 — between Licenses (50) and Invoices (60), matching §2 step 3 order.
  menuOrder: 55,
  icon: 'ti ti-truck-delivery',
  text: null,
  badge: null,
  display: 'Y' as const,
};

export async function seedTrackingMenu(db: Database | Transaction): Promise<void> {
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
    if (!inserted) throw new Error('seedTrackingMenu: insert returned no row');
    menuId = inserted.id;
  }

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
