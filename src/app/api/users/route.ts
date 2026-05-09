import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { hashPassword, getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('q')?.trim() || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)),
  );
  const offset = (page - 1) * pageSize;

  const params: unknown[] = [];
  let where = `WHERE u.display = 'Y'`;
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (u.username ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
  }

  const countSql = `SELECT COUNT(*)::int AS total FROM users_t u ${where}`;
  const countRes = await query<{ total: number }>(countSql, params);

  params.push(pageSize, offset);
  const dataSql = `
    SELECT u.id, u.username, u.full_name, u.email, u.mobile, u.role_id,
           r.role_name, u.profile_image, u.display, u.created_at, u.updated_at
      FROM users_t u
      LEFT JOIN role_master_t r ON r.id = u.role_id
      ${where}
     ORDER BY u.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const dataRes = await query(dataSql, params);

  return ok({
    items: dataRes.rows,
    total: countRes.rows[0].total,
    page,
    pageSize,
  });
}

const createSchema = z.object({
  username: z.string().min(3).max(255),
  password: z.string().min(6).max(100),
  email: z.string().email().max(100),
  full_name: z.string().min(1).max(255),
  mobile: z.string().max(15).optional().nullable(),
  role_id: z.number().int().positive(),
  location_id: z.string().max(100).optional().nullable(),
  dept_id: z.string().max(100).optional().nullable(),
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
    const data = parsed.data;
    const hashed = await hashPassword(data.password);

    const result = await query(
      `INSERT INTO users_t
         (username, password, email, mobile, full_name, role_id,
          location_id, dept_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
       RETURNING id, username, email, full_name, role_id, mobile,
                 location_id, dept_id, display, created_at`,
      [
        data.username,
        hashed,
        data.email,
        data.mobile ?? null,
        data.full_name,
        data.role_id,
        data.location_id ?? null,
        data.dept_id ?? null,
        session.uid,
      ],
    );

    return ok(result.rows[0], 201);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') return fail('Username or email already exists', 409);
    if (e.code === '23503') return fail('Invalid role_id', 400);
    // eslint-disable-next-line no-console
    console.error('[users.POST]', err);
    return fail('Server error', 500);
  }
}
