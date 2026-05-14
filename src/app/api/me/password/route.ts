import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
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

  const row = await query<{ password: string }>(
    `SELECT password FROM users_t WHERE id = $1`,
    [session.uid],
  );
  const current = row.rows[0];
  if (!current) return fail('User not found', 404);

  const matches = await verifyPassword(parsed.data.current_password, current.password);
  if (!matches) return fail('Current password is incorrect', 401);

  const hashed = await hashPassword(parsed.data.new_password);
  await query(
    `UPDATE users_t SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [hashed, session.uid],
  );

  return ok({ updated: true });
}
