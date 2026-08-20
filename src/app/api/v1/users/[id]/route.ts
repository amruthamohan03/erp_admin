import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, roleMaster, type UserInsert } from '@/db/schema';
import { hashPassword } from '@/lib/auth';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { userUpdateSchema } from '@/schemas';

// Next 15+/16: route params are now a Promise.
type Ctx = { params: Promise<{ id: string }> };

// §4.28 — the shape of a user as the audit trail records it. The password is
// absent by construction rather than stripped afterwards: a hash that is never
// put into a snapshot cannot leak from one.
const AUDIT_FIELDS = {
  username: usersT.username,
  full_name: usersT.fullName,
  email: usersT.email,
  mobile: usersT.mobile,
  role_id: usersT.roleId,
  location_id: usersT.locationId,
  dept_id: usersT.deptId,
  display: usersT.display,
} as const;

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

  const [row] = await db
    .select({
      id: usersT.id,
      username: usersT.username,
      full_name: usersT.fullName,
      email: usersT.email,
      mobile: usersT.mobile,
      role_id: usersT.roleId,
      role_name: roleMaster.roleName,
      profile_image: usersT.profileImage,
      signature_image: usersT.signatureImage,
      location_id: usersT.locationId,
      dept_id: usersT.deptId,
      display: usersT.display,
      created_at: usersT.createdAt,
      updated_at: usersT.updatedAt,
    })
    .from(usersT)
    .leftJoin(roleMaster, eq(roleMaster.id, usersT.roleId))
    .where(eq(usersT.id, id))
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

  const data = userUpdateSchema.parse(await req.json());

  const patch: Partial<UserInsert> = {};
  if (data.email !== undefined) patch.email = data.email;
  if (data.full_name !== undefined) patch.fullName = data.full_name;
  if (data.mobile !== undefined) patch.mobile = data.mobile;
  if (data.role_id !== undefined) patch.roleId = data.role_id;
  if (data.location_id !== undefined) patch.locationId = data.location_id;
  if (data.dept_id !== undefined) patch.deptId = data.dept_id;
  if (data.display !== undefined) patch.display = data.display;
  if (data.password) patch.password = await hashPassword(data.password);

  if (Object.keys(patch).length === 0) throw new BadRequestError('Nothing to update');

  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  try {
    const updatedId = await db.transaction(async (tx) => {
      const [before] = await tx.select(AUDIT_FIELDS).from(usersT).where(eq(usersT.id, id)).limit(1);
      if (!before) throw new NotFoundError();

      const [row] = await tx
        .update(usersT)
        .set(patch)
        .where(eq(usersT.id, id))
        .returning({ id: usersT.id });
      if (!row) throw new NotFoundError();

      const [after] = await tx.select(AUDIT_FIELDS).from(usersT).where(eq(usersT.id, id)).limit(1);

      // §4.28 lists role_change separately from user_change: moving someone
      // between roles changes what they can do, which is a different kind of
      // event from correcting their phone number.
      const roleChanged = before.role_id !== after?.role_id;
      await recordAudit(tx, {
        actorId: session.uid,
        action: roleChanged ? 'role_change' : 'user_change',
        entityType: 'user',
        entityId: String(id),
        module: 'users',
        before,
        after,
        // The new password is never recorded — only that one was set.
        metadata: data.password ? { password_changed: true } : undefined,
      });

      return row.id;
    });

    return ok({ id: updatedId });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') throw new ConflictError('Email already exists');
    if (code === '23503') throw new BadRequestError('Invalid role_id');
    throw err;
  }
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('Invalid id');
  if (id === session.uid) throw new BadRequestError('Cannot delete yourself');

  const deletedId = await db.transaction(async (tx) => {
    const [before] = await tx.select(AUDIT_FIELDS).from(usersT).where(eq(usersT.id, id)).limit(1);
    if (!before) throw new NotFoundError();

    const [row] = await tx
      .update(usersT)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(usersT.id, id))
      .returning({ id: usersT.id });
    if (!row) throw new NotFoundError();

    // §4.27 — this hides the account, it does not destroy it, so the entry
    // describes a soft delete.
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'delete',
      entityType: 'user',
      entityId: String(id),
      module: 'users',
      before,
      after: { ...before, display: 'N' },
      metadata: { username: before.username },
    });

    return row.id;
  });

  return ok({ id: deletedId });
});
