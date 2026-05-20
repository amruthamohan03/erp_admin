import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { roleMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

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
}

const createSchema = z.object({
  role_name: z.string().min(1).max(100),
  parent_role_id: z.number().int().positive().nullable().optional(),
  approval_level: z.number().int().nullable().optional(),
  department: z.number().int().min(0).max(1).default(0),
  management: z.number().int().min(0).max(1).default(0),
  finance: z.number().int().min(0).max(1).default(0),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;

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
    const e = err as { code?: string };
    if (e.code === '23503') return fail('Invalid parent_role_id', 400);
    // eslint-disable-next-line no-console
    console.error('[roles.POST]', err);
    return fail('Server error', 500);
  }
}
