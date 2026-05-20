import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, roleMaster } from '@/db/schema';
import { verifyPassword, signToken, setAuthCookie } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail('Invalid input', 422);

    const { username, password } = parsed.data;

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

    if (!user) return fail('Invalid credentials', 401);
    if (user.display !== 'Y') return fail('Account is disabled', 403);

    const valid = await verifyPassword(password, user.password);
    if (!valid) return fail('Invalid credentials', 401);

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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[login]', err);
    return fail('Server error', 500);
  }
}
