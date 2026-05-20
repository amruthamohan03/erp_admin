import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, type UserInsert } from '@/db/schema';
import { hashPassword, getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

// Next 15+/16: route params are now a Promise.
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const user = await db.query.usersT.findFirst({
    where: eq(usersT.id, id),
    columns: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      mobile: true,
      roleId: true,
      profileImage: true,
      signatureImage: true,
      locationId: true,
      deptId: true,
      display: true,
      createdAt: true,
      updatedAt: true,
    },
    with: {
      role: { columns: { roleName: true } },
    },
  });

  if (!user) return fail('Not found', 404);
  return ok({
    id: user.id,
    username: user.username,
    full_name: user.fullName,
    email: user.email,
    mobile: user.mobile,
    role_id: user.roleId,
    role_name: user.role?.roleName ?? null,
    profile_image: user.profileImage,
    signature_image: user.signatureImage,
    location_id: user.locationId,
    dept_id: user.deptId,
    display: user.display,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  });
}

const updateSchema = z.object({
  email: z.string().email().max(100).optional(),
  full_name: z.string().min(1).max(255).optional(),
  mobile: z.string().max(15).optional().nullable(),
  role_id: z.number().int().positive().optional(),
  password: z.string().min(6).max(100).optional(),
  location_id: z.string().max(100).optional().nullable(),
  dept_id: z.string().max(100).optional().nullable(),
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
    const data = parsed.data;

    const patch: Partial<UserInsert> = {};
    if (data.email !== undefined) patch.email = data.email;
    if (data.full_name !== undefined) patch.fullName = data.full_name;
    if (data.mobile !== undefined) patch.mobile = data.mobile;
    if (data.role_id !== undefined) patch.roleId = data.role_id;
    if (data.location_id !== undefined) patch.locationId = data.location_id;
    if (data.dept_id !== undefined) patch.deptId = data.dept_id;
    if (data.display !== undefined) patch.display = data.display;
    if (data.password) patch.password = await hashPassword(data.password);

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(usersT)
      .set(patch)
      .where(eq(usersT.id, id))
      .returning({ id: usersT.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') return fail('Email already exists', 409);
    if (e.code === '23503') return fail('Invalid role_id', 400);
    // eslint-disable-next-line no-console
    console.error('[users.PUT]', err);
    return fail('Server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);
  if (id === session.uid) return fail('Cannot delete yourself', 400);

  const [row] = await db
    .update(usersT)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(usersT.id, id))
    .returning({ id: usersT.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
