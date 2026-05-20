import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, type UserInsert } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

const schema = z.object({
  theme_preference: z.enum(['light', 'dark', 'system']).optional(),
  locale_preference: z.enum(['en', 'fr']).optional(),
  email_notifications: z.boolean().optional(),
  compact_mode: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail('Invalid input', 422, { errors: parsed.error.flatten() });
  }

  const patch: Partial<UserInsert> = {};
  if (parsed.data.theme_preference !== undefined)
    patch.themePreference = parsed.data.theme_preference;
  if (parsed.data.locale_preference !== undefined)
    patch.localePreference = parsed.data.locale_preference;
  if (parsed.data.email_notifications !== undefined)
    patch.emailNotifications = parsed.data.email_notifications ? 'Y' : 'N';
  if (parsed.data.compact_mode !== undefined)
    patch.compactMode = parsed.data.compact_mode ? 'Y' : 'N';

  if (Object.keys(patch).length === 0) return fail('No fields to update', 400);

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
}
