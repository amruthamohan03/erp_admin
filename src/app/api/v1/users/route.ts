import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, or, ilike, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, roleMaster } from '@/db/schema';
import { hashPassword, getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('q')?.trim() || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)),
  );
  const offset = (page - 1) * pageSize;

  const like = search ? `%${search}%` : null;
  const whereClause = like
    ? and(
        eq(usersT.display, 'Y'),
        or(
          ilike(usersT.username, like),
          ilike(usersT.fullName, like),
          ilike(usersT.email, like),
        ),
      )
    : eq(usersT.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(usersT)
    .where(whereClause);

  const items = await db
    .select({
      id: usersT.id,
      username: usersT.username,
      full_name: usersT.fullName,
      email: usersT.email,
      mobile: usersT.mobile,
      role_id: usersT.roleId,
      role_name: roleMaster.roleName,
      profile_image: usersT.profileImage,
      display: usersT.display,
      created_at: usersT.createdAt,
      updated_at: usersT.updatedAt,
    })
    .from(usersT)
    .leftJoin(roleMaster, eq(roleMaster.id, usersT.roleId))
    .where(whereClause)
    .orderBy(desc(usersT.id))
    .limit(pageSize)
    .offset(offset);

  return ok({
    items,
    total: countRow.total,
    page,
    pageSize,
  });
}

const createSchema = z.object({
  username: z.string().min(3).max(255),
  password: z.string().min(6).max(100),
  email: z.string().email().max(100),
  full_name: z.string().min(1).max(255),
  mobile: z.string().max(15).optional().nullable(),
  role_id: z.number().int().positive(),
  location_id: z.string().max(100).optional().nullable(),
  dept_id: z.string().max(100).optional().nullable(),
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
    const data = parsed.data;
    const hashed = await hashPassword(data.password);

    const [row] = await db
      .insert(usersT)
      .values({
        username: data.username,
        password: hashed,
        email: data.email,
        mobile: data.mobile ?? null,
        fullName: data.full_name,
        roleId: data.role_id,
        locationId: data.location_id ?? null,
        deptId: data.dept_id ?? null,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: usersT.id,
        username: usersT.username,
        email: usersT.email,
        full_name: usersT.fullName,
        role_id: usersT.roleId,
        mobile: usersT.mobile,
        location_id: usersT.locationId,
        dept_id: usersT.deptId,
        display: usersT.display,
        created_at: usersT.createdAt,
      });

    return ok(row, 201);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') return fail('Username or email already exists', 409);
    if (e.code === '23503') return fail('Invalid role_id', 400);
    // eslint-disable-next-line no-console
    console.error('[users.POST]', err);
    return fail('Server error', 500);
  }
}
