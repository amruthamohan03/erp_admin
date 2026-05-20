import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, type UserInsert } from '@/db/schema';
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
      signatureImage: true,
      bio: true,
      themePreference: true,
      localePreference: true,
      emailNotifications: true,
      compactMode: true,
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
    signature_image: user.signatureImage,
    bio: user.bio,
    theme_preference: user.themePreference,
    locale_preference: user.localePreference,
    email_notifications: user.emailNotifications,
    compact_mode: user.compactMode,
  });
}

const updateSchema = z.object({
  full_name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(100).optional(),
  mobile: z.string().max(15).nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }

    const patch: Partial<UserInsert> = {};
    if (parsed.data.full_name !== undefined) patch.fullName = parsed.data.full_name;
    if (parsed.data.email !== undefined) patch.email = parsed.data.email;
    if (parsed.data.mobile !== undefined) patch.mobile = parsed.data.mobile;
    if (parsed.data.bio !== undefined) patch.bio = parsed.data.bio;

    if (Object.keys(patch).length === 0) return fail('No fields to update', 400);

    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(usersT)
      .set(patch)
      .where(eq(usersT.id, session.uid))
      .returning({
        id: usersT.id,
        username: usersT.username,
        full_name: usersT.fullName,
        email: usersT.email,
        mobile: usersT.mobile,
        bio: usersT.bio,
      });

    return ok(row);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') return fail('Email already in use', 409);
    // eslint-disable-next-line no-console
    console.error('[me.profile.PUT]', err);
    return fail('Server error', 500);
  }
}
