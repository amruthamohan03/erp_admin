import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, count, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { roleMaster, usersT, type RoleMasterInsert } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const role = await db.query.roleMaster.findFirst({
    where: eq(roleMaster.id, id),
    columns: {
      id: true,
      roleName: true,
      parentRoleId: true,
      approvalLevel: true,
      department: true,
      management: true,
      finance: true,
      display: true,
      createdAt: true,
      updatedAt: true,
    },
    with: {
      parent: { columns: { roleName: true } },
    },
  });

  if (!role) return fail('Not found', 404);
  return ok({
    id: role.id,
    role_name: role.roleName,
    parent_role_id: role.parentRoleId,
    parent_role_name: role.parent?.roleName ?? null,
    approval_level: role.approvalLevel,
    department: role.department,
    management: role.management,
    finance: role.finance,
    display: role.display,
    created_at: role.createdAt,
    updated_at: role.updatedAt,
  });
}

const updateSchema = z.object({
  role_name: z.string().min(1).max(100).optional(),
  parent_role_id: z.number().int().positive().nullable().optional(),
  approval_level: z.number().int().nullable().optional(),
  department: z.number().int().min(0).max(1).optional(),
  management: z.number().int().min(0).max(1).optional(),
  finance: z.number().int().min(0).max(1).optional(),
  display: z.enum(['Y', 'N']).optional(),
});

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;
    if (d.parent_role_id === id) return fail('A role cannot be its own parent', 400);

    const patch: Partial<RoleMasterInsert> = {};
    if (d.role_name !== undefined) patch.roleName = d.role_name;
    if (d.parent_role_id !== undefined) patch.parentRoleId = d.parent_role_id;
    if (d.approval_level !== undefined) patch.approvalLevel = d.approval_level;
    if (d.department !== undefined) patch.department = d.department;
    if (d.management !== undefined) patch.management = d.management;
    if (d.finance !== undefined) patch.finance = d.finance;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(roleMaster)
      .set(patch)
      .where(eq(roleMaster.id, id))
      .returning({ id: roleMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23503') return fail('Invalid parent_role_id', 400);
    // eslint-disable-next-line no-console
    console.error('[roles.PUT]', err);
    return fail('Server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [usage] = await db
    .select({ count: count() })
    .from(usersT)
    .where(and(eq(usersT.roleId, id), eq(usersT.display, 'Y')));
  if (usage.count > 0) return fail('Role is in use by active users', 400);

  const [row] = await db
    .update(roleMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(roleMaster.id, id))
    .returning({ id: roleMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
