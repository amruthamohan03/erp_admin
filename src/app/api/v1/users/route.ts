import { NextRequest } from 'next/server';
import { and, eq, or, ilike, desc, count, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, roleMaster, mainOfficeMaster, departmentMaster } from '@/db/schema';
import { hashPassword } from '@/lib/auth';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ConflictError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { userCreateSchema, userListQuerySchema, type UserListQuery } from '@/schemas';

/**
 * The list's columns, shared with the Excel export so the spreadsheet cannot
 * drift from the screen it was exported from (§4.10, §4.15).
 */
export const USER_LIST_FIELDS = {
  id: usersT.id,
  username: usersT.username,
  full_name: usersT.fullName,
  email: usersT.email,
  mobile: usersT.mobile,
  role_id: usersT.roleId,
  role_name: roleMaster.roleName,
  location_id: usersT.locationId,
  location_name: mainOfficeMaster.mainLocationName,
  dept_id: usersT.deptId,
  department_name: departmentMaster.departmentName,
  profile_image: usersT.profileImage,
  display: usersT.display,
  created_at: usersT.createdAt,
  updated_at: usersT.updatedAt,
};

/**
 * One WHERE for the list and the export — an export of a filtered list must
 * contain the rows that list was showing (§4.15).
 *
 * Search covers the office and the department as well as the name fields: they
 * are columns on the grid now, and a column an operator can read is a column
 * they will type into the search box.
 */
export function buildUserListWhere(q: UserListQuery): SQL | undefined {
  const conds: SQL[] = [];
  if (q.status === 'active') conds.push(eq(usersT.display, 'Y'));
  else if (q.status === 'inactive') conds.push(eq(usersT.display, 'N'));

  if (q.location_id) conds.push(eq(usersT.locationId, q.location_id));
  if (q.dept_id) conds.push(eq(usersT.deptId, q.dept_id));

  const term = q.q?.trim();
  if (term) {
    const like = `%${term}%`;
    const match = or(
      ilike(usersT.username, like),
      ilike(usersT.fullName, like),
      ilike(usersT.email, like),
      ilike(mainOfficeMaster.mainLocationName, like),
      ilike(departmentMaster.departmentName, like),
    );
    if (match) conds.push(match);
  }

  return conds.length > 0 ? and(...conds) : undefined;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = userListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    location_id: searchParams.get('location_id') ?? undefined,
    dept_id: searchParams.get('dept_id') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const whereClause = buildUserListWhere(q);

  const [countRow] = await db
    .select({ total: count() })
    .from(usersT)
    .leftJoin(roleMaster, eq(roleMaster.id, usersT.roleId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, usersT.locationId))
    .leftJoin(departmentMaster, eq(departmentMaster.id, usersT.deptId))
    .where(whereClause);

  const items = await db
    .select(USER_LIST_FIELDS)
    .from(usersT)
    .leftJoin(roleMaster, eq(roleMaster.id, usersT.roleId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, usersT.locationId))
    .leftJoin(departmentMaster, eq(departmentMaster.id, usersT.deptId))
    .where(whereClause)
    .orderBy(desc(usersT.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
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
