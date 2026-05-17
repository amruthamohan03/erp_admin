import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, roleMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

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

  if (!user) return fail('User not found', 404);
  return ok(user);
}
