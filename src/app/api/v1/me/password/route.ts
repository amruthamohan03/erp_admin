import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT } from '@/db/schema';
import { verifyPassword, hashPassword } from '@/lib/auth';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { NotFoundError, UnauthorizedError } from '@/lib/errors';
import { passwordChangeSchema } from '@/schemas';

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = passwordChangeSchema.parse(await req.json());

  const [current] = await db
    .select({ password: usersT.password })
    .from(usersT)
    .where(eq(usersT.id, session.uid))
    .limit(1);
  if (!current) throw new NotFoundError('User not found');

  const matches = await verifyPassword(data.current_password, current.password);
  if (!matches) throw new UnauthorizedError('Current password is incorrect');

  const hashed = await hashPassword(data.new_password);
  await db
    .update(usersT)
    .set({
      password: hashed,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(usersT.id, session.uid));

  return ok({ updated: true });
});
