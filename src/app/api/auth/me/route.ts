import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const user = await db.query.usersT.findFirst({
    where: eq(usersT.id, session.uid),
    columns: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      mobile: true,
      roleId: true,
      profileImage: true,
      display: true,
    },
    with: {
      role: { columns: { roleName: true } },
    },
  });

  if (!user) return fail('User not found', 404);

  return ok({
    id: user.id,
    username: user.username,
    full_name: user.fullName,
    email: user.email,
    mobile: user.mobile,
    role_id: user.roleId,
    role_name: user.role?.roleName ?? null,
    profile_image: user.profileImage,
    display: user.display,
  });
}
