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
    `SELECT m.id, m.menu_id, m.menu_order, m.menu_level, m.menu_name,
            m.url, m.text, m.icon, m.badge, m.display,
            p.menu_name AS parent_name
       FROM menu_master_t m
       LEFT JOIN menu_master_t p ON p.id = m.menu_id
      WHERE m.id = $1`,
    [id],
  );

  if (!result.rows[0]) return fail('Not found', 404);
  return ok(result.rows[0]);
}

const updateSchema = z.object({
  menu_name: z.string().min(1).max(255).optional(),
  url: z.string().max(255).optional().nullable(),
  text: z.string().max(100).optional().nullable(),
  icon: z.string().max(100).optional().nullable(),
  badge: z.string().max(50).optional().nullable(),
  menu_id: z.number().int().positive().nullable().optional(),
  menu_order: z.number().int().min(0).optional(),
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

    // Block self-parenting
    if (d.menu_id === id) return fail('A menu cannot be its own parent', 400);

    // If parent is being changed, enforce 2-level rule and recompute level.
    let newLevel: number | undefined;
    if (d.menu_id !== undefined) {
      if (d.menu_id == null) {
        newLevel = 0;
      } else {
        const parent = await query<{ menu_level: number | null }>(
          `SELECT menu_level FROM menu_master_t WHERE id = $1`,
          [d.menu_id],
        );
        if (!parent.rows[0]) return fail('Parent menu not found', 400);
        if ((parent.rows[0].menu_level ?? 0) >= 1) {
          return fail('Only 2 levels of menus are supported', 400);
        }
        newLevel = 1;
      }

      // If this menu currently has children and we're trying to make it a child,
      // that would create a 3rd level. Block it.
      if (newLevel === 1) {
        const kids = await query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM menu_master_t WHERE menu_id = $1`,
          [id],
        );
        if (kids.rows[0].count > 0) {
          return fail(
            'This menu has children — cannot move it under another parent',
            400,
          );
        }
      }
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const add = (c: string, v: unknown) => {
      sets.push(`${c} = $${i++}`);
      values.push(v);
    };

    if (d.menu_name !== undefined) add('menu_name', d.menu_name);
    if (d.url !== undefined) add('url', d.url);
    if (d.text !== undefined) add('text', d.text);
    if (d.icon !== undefined) add('icon', d.icon);
    if (d.badge !== undefined) add('badge', d.badge);
    if (d.menu_id !== undefined) add('menu_id', d.menu_id);
    if (newLevel !== undefined) add('menu_level', newLevel);
    if (d.menu_order !== undefined) add('menu_order', d.menu_order);
    if (d.display !== undefined) add('display', d.display);

    if (sets.length === 0) return fail('Nothing to update', 400);

    add('updated_by', session.uid);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id);
    const sql = `UPDATE menu_master_t SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`;

    const result = await query(sql, values);
    if (!result.rows[0]) return fail('Not found', 404);
    return ok({ id: result.rows[0].id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[menus.PUT]', err);
    return fail('Server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  // Block deletion if children exist
  const kids = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM menu_master_t WHERE menu_id = $1 AND display = 'Y'`,
    [id],
  );
  if (kids.rows[0].count > 0) {
    return fail('Menu has active children — disable or move them first', 400);
  }

  const result = await query(
    `UPDATE menu_master_t
        SET display = 'N', updated_by = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    RETURNING id`,
    [session.uid, id],
  );
  if (!result.rows[0]) return fail('Not found', 404);
  return ok({ id: result.rows[0].id });
}
