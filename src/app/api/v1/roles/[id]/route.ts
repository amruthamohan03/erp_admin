import { NextRequest } from 'next/server';
import { and, count, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { roleMaster, usersT, type RoleMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { roleUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

  const parent = alias(roleMaster, 'p');
  const [row] = await db
    .select({
      id: roleMaster.id,
      role_name: roleMaster.roleName,
      parent_role_id: roleMaster.parentRoleId,
      parent_role_name: parent.roleName,
      approval_level: roleMaster.approvalLevel,
      department: roleMaster.department,
      management: roleMaster.management,
      finance: roleMaster.finance,
      display: roleMaster.display,
      created_at: roleMaster.createdAt,
      updated_at: roleMaster.updatedAt,
    })
    .from(roleMaster)
    .leftJoin(parent, eq(parent.id, roleMaster.parentRoleId))
    .where(eq(roleMaster.id, id))
    .limit(1);

  if (!row) throw new NotFoundError();
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

  const d = roleUpdateSchema.parse(await req.json());
  if (d.parent_role_id === id) throw new BadRequestError('A role cannot be its own parent');

  const patch: Partial<RoleMasterInsert> = {};
  if (d.role_name !== undefined) patch.roleName = d.role_name;
  if (d.parent_role_id !== undefined) patch.parentRoleId = d.parent_role_id;
  if (d.approval_level !== undefined) patch.approvalLevel = d.approval_level;
  if (d.department !== undefined) patch.department = d.department;
  if (d.management !== undefined) patch.management = d.management;
  if (d.finance !== undefined) patch.finance = d.finance;
  if (d.display !== undefined) patch.display = d.display;

  if (Object.keys(patch).length === 0) throw new BadRequestError('Nothing to update');

  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  try {
    const [row] = await db
      .update(roleMaster)
      .set(patch)
      .where(eq(roleMaster.id, id))
      .returning({ id: roleMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23503') {
      throw new BadRequestError('Invalid parent_role_id');
    }
    throw err;
  }
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

  const [usage] = await db
    .select({ count: count() })
    .from(usersT)
    .where(and(eq(usersT.roleId, id), eq(usersT.display, 'Y')));
  if (usage.count > 0) throw new BadRequestError('Role is in use by active users');

  const [row] = await db
    .update(roleMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(roleMaster.id, id))
    .returning({ id: roleMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
