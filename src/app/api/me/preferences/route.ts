import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
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

  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (parsed.data.theme_preference !== undefined) {
    updates.push(`theme_preference = $${idx++}`);
    params.push(parsed.data.theme_preference);
  }
  if (parsed.data.locale_preference !== undefined) {
    updates.push(`locale_preference = $${idx++}`);
    params.push(parsed.data.locale_preference);
  }
  if (parsed.data.email_notifications !== undefined) {
    updates.push(`email_notifications = $${idx++}`);
    params.push(parsed.data.email_notifications ? 'Y' : 'N');
  }
  if (parsed.data.compact_mode !== undefined) {
    updates.push(`compact_mode = $${idx++}`);
    params.push(parsed.data.compact_mode ? 'Y' : 'N');
  }

  if (updates.length === 0) return fail('No fields to update', 400);

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(session.uid);

  const result = await query(
    `UPDATE users_t SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING theme_preference, locale_preference, email_notifications, compact_mode`,
    params,
  );

  return ok(result.rows[0]);
}
