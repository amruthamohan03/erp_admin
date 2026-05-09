import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const result = await query(
    `SELECT r.id, r.role_name, r.parent_role_id, p.role_name AS parent_role_name,
            r.approval_level, r.department, r.management, r.finance,
            r.display, r.created_at, r.updated_at
       FROM role_master_t r
       LEFT JOIN role_master_t p ON p.id = r.parent_role_id
      WHERE r.id = $1`,
    [id],
  );

  if (!result.rows[0]) return fail('Not found', 404);
  return ok(result.rows[0]);
}

const updateSchema = z.object({
  role_name: z.string().min(1).max(100).optional(),
  parent_role_id: z.number().int().positive().nullable().optional(),
  approval_level: z.number().int().nullable().optional(),
  department: z.number().int().min(0).max(1).optional(),
  management: z.number().int().min(0).max(1).optional(),
  finance: z.number().int().min(0).max(1).optional(),
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
    const d = parsed.data;
    if (d.parent_role_id === id) return fail('A role cannot be its own parent', 400);

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const add = (c: string, v: unknown) => {
      sets.push(`${c} = $${i++}`);
      values.push(v);
    };

    if (d.role_name !== undefined) add('role_name', d.role_name);
    if (d.parent_role_id !== undefined) add('parent_role_id', d.parent_role_id);
    if (d.approval_level !== undefined) add('approval_level', d.approval_level);
    if (d.department !== undefined) add('department', d.department);
    if (d.management !== undefined) add('management', d.management);
    if (d.finance !== undefined) add('finance', d.finance);
    if (d.display !== undefined) add('display', d.display);

    if (sets.length === 0) return fail('Nothing to update', 400);

    add('updated_by', session.uid);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id);
    const sql = `UPDATE role_master_t SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`;

    const result = await query(sql, values);
    if (!result.rows[0]) return fail('Not found', 404);
    return ok({ id: result.rows[0].id });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23503') return fail('Invalid parent_role_id', 400);
    // eslint-disable-next-line no-console
    console.error('[roles.PUT]', err);
    return fail('Server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const inUse = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM users_t WHERE role_id=$1 AND display='Y'`,
    [id],
  );
  if (inUse.rows[0].count > 0) return fail('Role is in use by active users', 400);

  const result = await query(
    `UPDATE role_master_t SET display='N', updated_by=$1, updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 RETURNING id`,
    [session.uid, id],
  );
  if (!result.rows[0]) return fail('Not found', 404);
  return ok({ id: result.rows[0].id });
}
