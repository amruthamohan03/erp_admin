import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT } from '@/db/schema';
import { hashPassword } from '@/lib/auth';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { NotFoundError } from '@/lib/errors';
import { passwordChangeSchema } from '@/schemas';

// PUT /api/v1/me/password — change your own password.
//
// The current password is NOT asked for. The authenticated session is the only
// proof of identity, so whoever holds the cookie may set a new password; this
// matches the self-service flow the operator asked for, where an administrator
// resets a forgotten password anyway.
//
// It changes only the CALLER's password — the row is found by `session.uid`,
// never by an id in the body — so this route cannot be used to take over
// another account whatever is posted to it.
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = passwordChangeSchema.parse(await req.json());

  const hashed = await hashPassword(data.new_password);
  const [updated] = await db
    .update(usersT)
    .set({
      password: hashed,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(usersT.id, session.uid))
    .returning({ id: usersT.id });
  // A session whose user has since been deleted must not report success.
  if (!updated) throw new NotFoundError('Your user account no longer exists.');

  return ok({ updated: true });
});
