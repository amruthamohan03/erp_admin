import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT } from '@/db/schema';
import { getSession, verifyPassword, hashPassword } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

const schema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6).max(100),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail('Invalid input', 422, { errors: parsed.error.flatten() });
  }

  const [current] = await db
    .select({ password: usersT.password })
    .from(usersT)
    .where(eq(usersT.id, session.uid))
    .limit(1);
  if (!current) return fail('User not found', 404);

  const matches = await verifyPassword(parsed.data.current_password, current.password);
  if (!matches) return fail('Current password is incorrect', 401);

  const hashed = await hashPassword(parsed.data.new_password);
  await db
    .update(usersT)
    .set({
      password: hashed,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(usersT.id, session.uid));

  return ok({ updated: true });
}
