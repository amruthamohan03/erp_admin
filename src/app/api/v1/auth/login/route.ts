import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, roleMaster } from '@/db/schema';
import { verifyPassword, signToken, setAuthCookie } from '@/lib/auth';
import { ok, withErrorHandler } from '@/lib/api';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors';
import { loginSchema } from '@/schemas';

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

  if (!user) throw new UnauthorizedError('Invalid credentials');
  if (user.display !== 'Y') throw new ForbiddenError('Account is disabled');

  const valid = await verifyPassword(password, user.password);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const token = await signToken({
    uid: user.id,
    username: user.username,
    role_id: user.role_id,
    role_name: user.role_name,
  });

  await setAuthCookie(token);

  return ok({
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    role_id: user.role_id,
    role_name: user.role_name,
  });
});
