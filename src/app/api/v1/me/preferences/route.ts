import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, type UserInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { preferencesUpdateSchema } from '@/schemas';

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = preferencesUpdateSchema.parse(await req.json());

  const patch: Partial<UserInsert> = {};
  if (data.theme_preference !== undefined) patch.themePreference = data.theme_preference;
  if (data.locale_preference !== undefined) patch.localePreference = data.locale_preference;
  if (data.email_notifications !== undefined)
    patch.emailNotifications = data.email_notifications ? 'Y' : 'N';
  if (data.compact_mode !== undefined)
    patch.compactMode = data.compact_mode ? 'Y' : 'N';

  if (Object.keys(patch).length === 0) throw new BadRequestError('No fields to update');

  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  const [row] = await db
    .update(usersT)
    .set(patch)
    .where(eq(usersT.id, session.uid))
    .returning({
      theme_preference: usersT.themePreference,
      locale_preference: usersT.localePreference,
      email_notifications: usersT.emailNotifications,
      compact_mode: usersT.compactMode,
    });

  return ok(row);
});
