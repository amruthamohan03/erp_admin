import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, roleMaster, type UserInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import { profileUpdateSchema } from '@/schemas';

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
      signature_image: usersT.signatureImage,
      bio: usersT.bio,
      theme_preference: usersT.themePreference,
      locale_preference: usersT.localePreference,
      email_notifications: usersT.emailNotifications,
      compact_mode: usersT.compactMode,
    })
    .from(usersT)
    .innerJoin(roleMaster, eq(roleMaster.id, usersT.roleId))
    .where(eq(usersT.id, session.uid))
    .limit(1);

  if (!user) throw new NotFoundError('User not found');
  return ok(user);
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = profileUpdateSchema.parse(await req.json());

  const patch: Partial<UserInsert> = {};
  if (data.full_name !== undefined) patch.fullName = data.full_name;
  if (data.email !== undefined) patch.email = data.email;
  if (data.mobile !== undefined) patch.mobile = data.mobile;
  if (data.bio !== undefined) patch.bio = data.bio;

  if (Object.keys(patch).length === 0) throw new BadRequestError('No fields to update');

  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  try {
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
    if ((err as { code?: string }).code === '23505') {
      throw new ConflictError('Email already in use');
    }
    throw err;
  }
});
