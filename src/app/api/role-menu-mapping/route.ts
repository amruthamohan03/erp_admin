import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { menuMaster, roleMaster, roleMenuMapping } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

// GET /api/role-menu-mapping?role_id=N
// Returns every active menu row joined with its (possibly absent) mapping for the role.
// Missing mapping rows surface as all-false permission flags so the UI can render the matrix.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const roleIdParam = searchParams.get('role_id');
  if (!roleIdParam) return fail('role_id is required', 400);
  const roleId = Number(roleIdParam);
  if (!Number.isInteger(roleId) || roleId <= 0) {
    return fail('role_id must be a positive integer', 400);
  }

  // Reject unknown role early so the UI gets a clean error.
  const role = await db.query.roleMaster.findFirst({
    where: and(eq(roleMaster.id, roleId), eq(roleMaster.display, 'Y')),
    columns: { id: true },
  });
  if (!role) return fail('Role not found', 404);

  const rows = await db.query.menuMaster.findMany({
    where: eq(menuMaster.display, 'Y'),
    with: {
      parent: { columns: { menuName: true } },
      roleMappings: {
        where: eq(roleMenuMapping.roleId, roleId),
        columns: {
          canView: true,
          canAdd: true,
          canEdit: true,
          canDelete: true,
          canApprove: true,
        },
      },
    },
    orderBy: [asc(menuMaster.menuOrder), asc(menuMaster.id)],
  });

  const data = rows.map((m) => {
    const mapping = m.roleMappings[0];
    return {
      menu_id: m.id,
      menu_parent_id: m.menuId,
      menu_name: m.menuName,
      menu_level: m.menuLevel,
      menu_order: m.menuOrder,
      url: m.url,
      icon: m.icon,
      parent_name: m.parent?.menuName ?? null,
      can_view: mapping?.canView ?? false,
      can_add: mapping?.canAdd ?? false,
      can_edit: mapping?.canEdit ?? false,
      can_delete: mapping?.canDelete ?? false,
      can_approve: mapping?.canApprove ?? false,
    };
  });

  return ok({ role_id: roleId, menus: data });
}

const mappingRow = z.object({
  menu_id: z.number().int().positive(),
  can_view: z.boolean().default(false),
  can_add: z.boolean().default(false),
  can_edit: z.boolean().default(false),
  can_delete: z.boolean().default(false),
  can_approve: z.boolean().default(false),
});

const putSchema = z.object({
  role_id: z.number().int().positive(),
  mappings: z.array(mappingRow),
});

// PUT /api/role-menu-mapping
// Bulk upsert for one role. Rows where every permission is false are deleted
// to keep the mapping table free of all-zero junk.
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const { role_id, mappings } = parsed.data;

    const role = await db.query.roleMaster.findFirst({
      where: eq(roleMaster.id, role_id),
      columns: { id: true },
    });
    if (!role) return fail('Role not found', 404);

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

    return ok({ role_id, saved: grant.length, removed: revoke.length });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23503') return fail('Invalid role_id or menu_id', 400);
    // eslint-disable-next-line no-console
    console.error('[role-menu-mapping.PUT]', err);
    return fail('Server error', 500);
  }
}
