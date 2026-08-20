import { NextRequest } from 'next/server';
import { and, eq, or, ilike, desc, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, roleMaster } from '@/db/schema';
import { hashPassword } from '@/lib/auth';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ConflictError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { userCreateSchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

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

  return ok(items, {
    meta: { total: countRow.total, page, pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = userCreateSchema.parse(await req.json());
  const hashed = await hashPassword(data.password);

  try {
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
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

      // §4.28 — creating an account is a logged change, in the same transaction.
      // The returned row carries no password column, so the snapshot cannot.
      await recordAudit(tx, {
        actorId: session.uid,
        action: 'create',
        entityType: 'user',
        entityId: String(created.id),
        module: 'users',
        after: created,
      });

      return created;
    });

    return ok(row, 201);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') throw new ConflictError('Username or email already exists');
    if (code === '23503') throw new BadRequestError('Invalid role_id');
    throw err;
  }
});
