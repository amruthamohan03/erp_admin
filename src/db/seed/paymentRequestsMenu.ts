import { eq, sql } from 'drizzle-orm';
import { menuMaster, roleMenuMapping } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Sidebar entry for /payment-requests + admin grant.

const MENU_URL = '/payment-requests';
const MENU_NAME = 'Payment requests';
const ADMIN_ROLE_ID = 1;

const MENU_DEFAULTS = {
  menuName: MENU_NAME,
  url: MENU_URL,
  menuId: null,
  menuLevel: 0,
  menuOrder: 70, // below Licenses (50) and Invoices (60)
  icon: 'ti ti-cash',
  text: null,
  badge: null,
  display: 'Y' as const,
};

export async function seedPaymentRequestsMenu(
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
    if (!inserted)
      throw new Error('seedPaymentRequestsMenu: insert returned no row');
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
