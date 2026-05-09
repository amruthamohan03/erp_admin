import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { verifyPassword, signToken, setAuthCookie } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

interface UserRow {
  id: number;
  username: string;
  password: string;
  full_name: string;
  email: string;
  role_id: number;
  role_name: string;
  display: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail('Invalid input', 422);

    const { username, password } = parsed.data;

    const result = await query<UserRow>(
      `SELECT u.id, u.username, u.password, u.full_name, u.email, u.role_id,
              u.display, r.role_name
         FROM users_t u
         JOIN role_master_t r ON r.id = u.role_id
        WHERE u.username = $1
        LIMIT 1`,
      [username],
    );

    const user = result.rows[0];
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
