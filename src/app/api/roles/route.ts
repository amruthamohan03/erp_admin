import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const result = await query(
    `SELECT r.id, r.role_name, r.parent_role_id, p.role_name AS parent_role_name,
            r.approval_level, r.department, r.management, r.finance,
            r.display, r.created_at, r.updated_at
       FROM role_master_t r
       LEFT JOIN role_master_t p ON p.id = r.parent_role_id
      WHERE r.display = 'Y'
      ORDER BY r.id ASC`,
  );

  return ok(result.rows);
}

const createSchema = z.object({
  role_name: z.string().min(1).max(100),
  parent_role_id: z.number().int().positive().nullable().optional(),
  approval_level: z.number().int().nullable().optional(),
  department: z.number().int().min(0).max(1).default(0),
  management: z.number().int().min(0).max(1).default(0),
  finance: z.number().int().min(0).max(1).default(0),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    const result = await query(
      `INSERT INTO role_master_t
         (role_name, parent_role_id, approval_level, department, management, finance,
          created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
       RETURNING id, role_name, parent_role_id, approval_level, department,
                 management, finance, display, created_at`,
      [
        d.role_name,
        d.parent_role_id ?? null,
        d.approval_level ?? null,
        d.department,
        d.management,
        d.finance,
        session.uid,
      ],
    );

    return ok(result.rows[0], 201);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23503') return fail('Invalid parent_role_id', 400);
    // eslint-disable-next-line no-console
    console.error('[roles.POST]', err);
    return fail('Server error', 500);
  }
}
