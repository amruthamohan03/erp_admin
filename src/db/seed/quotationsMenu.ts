import { eq, sql } from 'drizzle-orm';
import { menuMaster, roleMenuMapping } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

const MENU_URL = '/quotations';
const MENU_NAME = 'Quotations';
const ADMIN_ROLE_ID = 1;

const MENU_DEFAULTS = {
  menuName: MENU_NAME,
  url: MENU_URL,
  menuId: null,
  menuLevel: 0,
  // 45 — between licences (50) and the masters cluster (25-37) since
  // quotations are a top-level transactional surface (not a master).
  menuOrder: 45,
  icon: 'ti ti-file-invoice',
  text: null,
  badge: null,
  display: 'Y' as const,
};

export async function seedQuotationsMenu(
  db: Database | Transaction,
): Promise<void> {
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
    if (!inserted) throw new Error('seedQuotationsMenu: insert returned no row');
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
