import { NextRequest } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { roleMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { roleCreateSchema } from '@/schemas';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const parent = alias(roleMaster, 'p');
  const rows = await db
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
    .where(eq(roleMaster.display, 'Y'))
    .orderBy(asc(roleMaster.id));

  return ok(rows);
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const d = roleCreateSchema.parse(await req.json());

  try {
    const [row] = await db
      .insert(roleMaster)
      .values({
        roleName: d.role_name,
        parentRoleId: d.parent_role_id ?? null,
        approvalLevel: d.approval_level ?? null,
        department: d.department,
        management: d.management,
        finance: d.finance,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: roleMaster.id,
        role_name: roleMaster.roleName,
        parent_role_id: roleMaster.parentRoleId,
        approval_level: roleMaster.approvalLevel,
        department: roleMaster.department,
        management: roleMaster.management,
        finance: roleMaster.finance,
        display: roleMaster.display,
        created_at: roleMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23503') {
      throw new BadRequestError('Invalid parent_role_id');
    }
    throw err;
  }
});
