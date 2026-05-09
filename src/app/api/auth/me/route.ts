import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const result = await query(
    `SELECT u.id, u.username, u.full_name, u.email, u.mobile,
            u.role_id, r.role_name, u.profile_image, u.display
       FROM users_t u
       JOIN role_master_t r ON r.id = u.role_id
      WHERE u.id = $1`,
    [session.uid],
  );

  const user = result.rows[0];
  if (!user) return fail('User not found', 404);

  return ok(user);
}
