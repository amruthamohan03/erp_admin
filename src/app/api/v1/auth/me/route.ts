import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, roleMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { NotFoundError } from '@/lib/errors';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const [user] = await db
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
    })
    .from(usersT)
    .innerJoin(roleMaster, eq(roleMaster.id, usersT.roleId))
    .where(eq(usersT.id, session.uid))
    .limit(1);

  if (!user) throw new NotFoundError('User not found');
  return ok(user);
});
