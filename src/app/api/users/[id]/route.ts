import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { hashPassword, getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

// Next 15+/16: route params are now a Promise.
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const result = await query(
    `SELECT u.id, u.username, u.full_name, u.email, u.mobile,
            u.role_id, r.role_name, u.profile_image, u.signature_image,
            u.location_id, u.dept_id, u.display, u.created_at, u.updated_at
       FROM users_t u
       LEFT JOIN role_master_t r ON r.id = u.role_id
      WHERE u.id = $1`,
    [id],
  );

  if (!result.rows[0]) return fail('Not found', 404);
  return ok(result.rows[0]);
}

const updateSchema = z.object({
  email: z.string().email().max(100).optional(),
  full_name: z.string().min(1).max(255).optional(),
  mobile: z.string().max(15).optional().nullable(),
  role_id: z.number().int().positive().optional(),
  password: z.string().min(6).max(100).optional(),
  location_id: z.string().max(100).optional().nullable(),
  dept_id: z.string().max(100).optional().nullable(),
  display: z.enum(['Y', 'N']).optional(),
});

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const data = parsed.data;

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const add = (col: string, val: unknown) => {
      sets.push(`${col} = $${i++}`);
      values.push(val);
    };

    if (data.email !== undefined) add('email', data.email);
    if (data.full_name !== undefined) add('full_name', data.full_name);
    if (data.mobile !== undefined) add('mobile', data.mobile);
    if (data.role_id !== undefined) add('role_id', data.role_id);
    if (data.location_id !== undefined) add('location_id', data.location_id);
    if (data.dept_id !== undefined) add('dept_id', data.dept_id);
    if (data.display !== undefined) add('display', data.display);
    if (data.password) add('password', await hashPassword(data.password));

    if (sets.length === 0) return fail('Nothing to update', 400);

    add('updated_by', session.uid);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id);
    const sql = `UPDATE users_t SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`;

    const result = await query(sql, values);
    if (!result.rows[0]) return fail('Not found', 404);

    return ok({ id: result.rows[0].id });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') return fail('Email already exists', 409);
    if (e.code === '23503') return fail('Invalid role_id', 400);
    // eslint-disable-next-line no-console
    console.error('[users.PUT]', err);
    return fail('Server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);
  if (id === session.uid) return fail('Cannot delete yourself', 400);

  const result = await query(
    `UPDATE users_t SET display='N', updated_by=$1, updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 RETURNING id`,
    [session.uid, id],
  );
  if (!result.rows[0]) return fail('Not found', 404);
  return ok({ id: result.rows[0].id });
}
