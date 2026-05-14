import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const result = await query(
    `SELECT u.id, u.username, u.full_name, u.email, u.mobile, u.role_id,
            r.role_name, u.profile_image, u.signature_image, u.bio,
            u.theme_preference, u.locale_preference,
            u.email_notifications, u.compact_mode
       FROM users_t u
       JOIN role_master_t r ON r.id = u.role_id
      WHERE u.id = $1`,
    [session.uid],
  );

  const user = result.rows[0];
  if (!user) return fail('User not found', 404);

  return ok(user);
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

    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      updates.push(`${key} = $${idx++}`);
      params.push(value);
    }

    if (updates.length === 0) {
      return fail('No fields to update', 400);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(session.uid);

    const result = await query(
      `UPDATE users_t SET ${updates.join(', ')} WHERE id = $${idx}
         RETURNING id, username, full_name, email, mobile, bio`,
      params,
    );

    return ok(result.rows[0]);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') return fail('Email already in use', 409);
    // eslint-disable-next-line no-console
    console.error('[me.profile.PUT]', err);
    return fail('Server error', 500);
  }
}
