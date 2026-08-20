import { NextRequest } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { menuMaster, roleMaster, roleMenuMapping } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { roleMenuMappingPutSchema, PERMISSION_FLAG_KEYS, grantsNothing } from '@/schemas';
import { recordAudit } from '@/lib/audit/recordAudit';

// §4.28 — a permission change is one of the events an investigation cares most
// about, and a 13-flag × N-menu matrix is unreadable as two raw snapshots. Each
// menu is collapsed to the grants it holds, so the diff reads
// `Clients: view, add → view, add, edit`.
function grantSummary(row: Record<string, unknown>): string {
  const held = PERMISSION_FLAG_KEYS.filter((k) => row[k] === true).map((k) =>
    k.replace(/^can_/u, '').replace(/_/gu, ' '),
  );
  return held.length > 0 ? held.join(', ') : 'none';
}

// GET /api/v1/role-menu-mapping?role_id=N
// Returns every active menu row joined with its (possibly absent) mapping for the role.
// Missing mapping rows surface as all-false permission flags so the UI can render the matrix.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const roleIdParam = searchParams.get('role_id');
  if (!roleIdParam) throw new BadRequestError('role_id is required');
  const roleId = Number(roleIdParam);
  if (!Number.isInteger(roleId) || roleId <= 0) {
    throw new BadRequestError('role_id must be a positive integer');
  }

  // Reject unknown role early so the UI gets a clean error.
  const [role] = await db
    .select({ id: roleMaster.id })
    .from(roleMaster)
    .where(and(eq(roleMaster.id, roleId), eq(roleMaster.display, 'Y')))
    .limit(1);
  if (!role) throw new NotFoundError('Role not found');

  const parent = alias(menuMaster, 'p');
  const rows = await db
    .select({
      menu_id: menuMaster.id,
      menu_parent_id: menuMaster.menuId,
      menu_name: menuMaster.menuName,
      menu_level: menuMaster.menuLevel,
      menu_order: menuMaster.menuOrder,
      url: menuMaster.url,
      icon: menuMaster.icon,
      parent_name: parent.menuName,
      can_view: roleMenuMapping.canView,
      can_add: roleMenuMapping.canAdd,
      can_edit: roleMenuMapping.canEdit,
      can_delete: roleMenuMapping.canDelete,
      can_restore: roleMenuMapping.canRestore,
      can_permanent_delete: roleMenuMapping.canPermanentDelete,
      can_approve: roleMenuMapping.canApprove,
      can_export: roleMenuMapping.canExport,
      can_import: roleMenuMapping.canImport,
      can_print: roleMenuMapping.canPrint,
      can_view_audit: roleMenuMapping.canViewAudit,
      can_export_audit: roleMenuMapping.canExportAudit,
      can_manage_settings: roleMenuMapping.canManageSettings,
    })
    .from(menuMaster)
    .leftJoin(parent, eq(parent.id, menuMaster.menuId))
    .leftJoin(
      roleMenuMapping,
      and(
        eq(roleMenuMapping.menuId, menuMaster.id),
        eq(roleMenuMapping.roleId, roleId),
      ),
    )
    .where(eq(menuMaster.display, 'Y'))
    .orderBy(asc(menuMaster.menuOrder), asc(menuMaster.id));

  // A menu with no mapping row for this role left-joins to nulls; the matrix
  // wants explicit falses. Derived from PERMISSION_FLAG_KEYS so a new flag needs
  // no edit here.
  const data = rows.map((r) => {
    const row = r as Record<string, unknown>;
    const flags = Object.fromEntries(
      PERMISSION_FLAG_KEYS.map((k) => [k, row[k] ?? false]),
    );
    return { ...r, ...flags };
  });

  return ok({ role_id: roleId, menus: data });
});

// PUT /api/v1/role-menu-mapping
// Bulk upsert for one role. Rows where every permission is false are deleted
// to keep the mapping table free of all-zero junk.
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { role_id, mappings } = roleMenuMappingPutSchema.parse(await req.json());

  const [role] = await db
    .select({ id: roleMaster.id })
    .from(roleMaster)
    .where(eq(roleMaster.id, role_id))
    .limit(1);
  if (!role) throw new NotFoundError('Role not found');

  // A row granting nothing is deleted rather than stored, so the table holds no
  // all-false junk. Both sides read one predicate — listing the flags by hand is
  // how a new flag silently fails to save.
  const grant = mappings.filter((m) => !grantsNothing(m));
  const revoke = mappings.filter((m) => grantsNothing(m)).map((m) => m.menu_id);

  // Read the role's current grants before the write — afterwards there is
  // nothing left to compare against. Selected under the snake_case flag names so
  // one grantSummary() reads both the stored row and the submitted payload.
  const existing = await db
    .select({
      menu_id: roleMenuMapping.menuId,
      can_view: roleMenuMapping.canView,
      can_add: roleMenuMapping.canAdd,
      can_edit: roleMenuMapping.canEdit,
      can_delete: roleMenuMapping.canDelete,
      can_restore: roleMenuMapping.canRestore,
      can_permanent_delete: roleMenuMapping.canPermanentDelete,
      can_approve: roleMenuMapping.canApprove,
      can_export: roleMenuMapping.canExport,
      can_import: roleMenuMapping.canImport,
      can_print: roleMenuMapping.canPrint,
      can_view_audit: roleMenuMapping.canViewAudit,
      can_export_audit: roleMenuMapping.canExportAudit,
      can_manage_settings: roleMenuMapping.canManageSettings,
    })
    .from(roleMenuMapping)
    .where(eq(roleMenuMapping.roleId, role_id));

  const menuNames = new Map(
    (await db.select({ id: menuMaster.id, name: menuMaster.menuName }).from(menuMaster)).map(
      (m) => [m.id, m.name] as const,
    ),
  );

  const beforeByMenu = new Map(existing.map((e) => [e.menu_id, grantSummary(e)]));
  const afterByMenu = new Map(
    mappings.map((m) => [m.menu_id, grantSummary(m as Record<string, unknown>)]),
  );

  // Only the menus that actually moved go into the snapshot — a full matrix on
  // every save would bury the one row that changed.
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  for (const menuId of new Set([...beforeByMenu.keys(), ...afterByMenu.keys()])) {
    const was = beforeByMenu.get(menuId) ?? 'none';
    const now = afterByMenu.get(menuId) ?? was;
    if (was === now) continue;
    const name = menuNames.get(menuId) ?? `Menu #${menuId}`;
    before[name] = was;
    after[name] = now;
  }

  try {
    await db.transaction(async (tx) => {
      if (revoke.length > 0) {
        await tx
          .delete(roleMenuMapping)
          .where(
            and(
              eq(roleMenuMapping.roleId, role_id),
              inArray(roleMenuMapping.menuId, revoke),
            ),
          );
      }

      // §4.28 — in the same transaction as the change it describes. A save that
      // moved nothing is not logged: it is not a change, and an entry per
      // idle visit to the matrix would bury the ones that matter.
      if (Object.keys(before).length > 0) {
        await recordAudit(tx, {
          actorId: session.uid,
          action: 'permission_change',
          entityType: 'role-menu-mapping',
          entityId: String(role_id),
          module: 'permissions',
          before,
          after,
          metadata: { role_id, menus_changed: Object.keys(before).length },
        });
      }

      if (grant.length === 0) return;

      const values = grant.map((m) => ({
        roleId: role_id,
        menuId: m.menu_id,
        canView: m.can_view,
        canAdd: m.can_add,
        canEdit: m.can_edit,
        canDelete: m.can_delete,
        canRestore: m.can_restore,
        canPermanentDelete: m.can_permanent_delete,
        canApprove: m.can_approve,
        canExport: m.can_export,
        canImport: m.can_import,
        canPrint: m.can_print,
        canViewAudit: m.can_view_audit,
        canExportAudit: m.can_export_audit,
        canManageSettings: m.can_manage_settings,
        createdBy: session.uid,
        updatedBy: session.uid,
      }));

      await tx
        .insert(roleMenuMapping)
        .values(values)
        .onConflictDoUpdate({
          target: [roleMenuMapping.roleId, roleMenuMapping.menuId],
          set: {
            canView: sql`excluded.can_view`,
            canAdd: sql`excluded.can_add`,
            canEdit: sql`excluded.can_edit`,
            canDelete: sql`excluded.can_delete`,
            canRestore: sql`excluded.can_restore`,
            canPermanentDelete: sql`excluded.can_permanent_delete`,
            canApprove: sql`excluded.can_approve`,
            canExport: sql`excluded.can_export`,
            canImport: sql`excluded.can_import`,
            canPrint: sql`excluded.can_print`,
            canViewAudit: sql`excluded.can_view_audit`,
            canExportAudit: sql`excluded.can_export_audit`,
            canManageSettings: sql`excluded.can_manage_settings`,
            updatedBy: session.uid,
            updatedAt: sql`now()`,
          },
        });
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23503') {
      throw new BadRequestError('Invalid role_id or menu_id');
    }
    throw err;
  }

  return ok({ role_id, saved: grant.length, removed: revoke.length });
});
