import { NextRequest } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { menuMaster, roleMaster, roleMenuMapping } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { roleMenuMappingPutSchema } from '@/schemas';

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
      can_approve: roleMenuMapping.canApprove,
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

  const data = rows.map((r) => ({
    ...r,
    can_view: r.can_view ?? false,
    can_add: r.can_add ?? false,
    can_edit: r.can_edit ?? false,
    can_delete: r.can_delete ?? false,
    can_approve: r.can_approve ?? false,
  }));

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

  const grant = mappings.filter(
    (m) =>
      m.can_view || m.can_add || m.can_edit || m.can_delete || m.can_approve,
  );
  const revoke = mappings
    .filter(
      (m) =>
        !m.can_view &&
        !m.can_add &&
        !m.can_edit &&
        !m.can_delete &&
        !m.can_approve,
    )
    .map((m) => m.menu_id);

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

      if (grant.length === 0) return;

      const values = grant.map((m) => ({
        roleId: role_id,
        menuId: m.menu_id,
        canView: m.can_view,
        canAdd: m.can_add,
        canEdit: m.can_edit,
        canDelete: m.can_delete,
        canApprove: m.can_approve,
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
            canApprove: sql`excluded.can_approve`,
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
