import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, roleMaster } from '@/db/schema';
import { verifyPassword, signToken, setAuthCookie } from '@/lib/auth';
import { ok, withErrorHandler } from '@/lib/api';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { loginSchema } from '@/schemas';

// §4.28 — a failed sign-in is logged as carefully as a successful one: repeated
// failures against one username are the signal an investigation looks for, and
// they are invisible if only successes are recorded.
//
// The username is recorded, the password never is. `metadata` here is written by
// hand rather than snapshotted so there is no path by which the submitted
// credential could reach the table.
async function logAttempt(
  action: 'login' | 'failed_login',
  actor: { id: number; role: string } | null,
  username: string,
  reason?: string,
): Promise<void> {
  await recordAudit(db, {
    actorId: actor?.id ?? null,
    action,
    entityType: 'auth',
    entityId: actor ? String(actor.id) : username,
    module: 'auth',
    // Passed rather than read from the session: on a sign-in the cookie is only
    // just being set, and on a failure there is no session at all.
    actorRole: actor?.role ?? null,
    metadata: reason ? { username, reason } : { username },
  });
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { username, password } = loginSchema.parse(await req.json());

  const [user] = await db
    .select({
      id: usersT.id,
      username: usersT.username,
      password: usersT.password,
      full_name: usersT.fullName,
      email: usersT.email,
      role_id: usersT.roleId,
      display: usersT.display,
      role_name: roleMaster.roleName,
    })
    .from(usersT)
    .innerJoin(roleMaster, eq(roleMaster.id, usersT.roleId))
    .where(eq(usersT.username, username))
    .limit(1);

  if (!user) {
    await logAttempt('failed_login', null, username, 'unknown_username');
    throw new UnauthorizedError('Invalid credentials');
  }
  if (user.display !== 'Y') {
    await logAttempt('failed_login', { id: user.id, role: user.role_name }, username, 'account_disabled');
    throw new ForbiddenError('Account is disabled');
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    await logAttempt('failed_login', { id: user.id, role: user.role_name }, username, 'wrong_password');
    throw new UnauthorizedError('Invalid credentials');
  }

  const token = await signToken({
    uid: user.id,
    username: user.username,
    role_id: user.role_id,
    role_name: user.role_name,
  });

  await setAuthCookie(token);

  await logAttempt('login', { id: user.id, role: user.role_name }, user.username);

  return ok({
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    role_id: user.role_id,
    role_name: user.role_name,
  });
});
