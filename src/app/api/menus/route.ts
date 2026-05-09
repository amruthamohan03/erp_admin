import { NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import type { MenuItem, MenuTreeNode } from '@/types/menu';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const flat = searchParams.get('flat') === '1';
  const includeHidden = searchParams.get('includeHidden') === '1';

  const where = includeHidden ? '' : `WHERE m.display = 'Y'`;
  const result = await query<MenuItem & { parent_name: string | null }>(
    `SELECT m.id, m.menu_id, m.menu_order, m.menu_level, m.menu_name,
            m.url, m.text, m.icon, m.badge, m.display,
            p.menu_name AS parent_name
       FROM menu_master_t m
       LEFT JOIN menu_master_t p ON p.id = m.menu_id
       ${where}
      ORDER BY m.menu_order ASC, m.id ASC`,
  );

  // Flat list (used by the management page)
  if (flat) {
    return ok(result.rows);
  }

  // Build a 2-level tree (used by the sidebar)
  const byId = new Map<number, MenuTreeNode>();
  result.rows.forEach((row) => {
    byId.set(row.id, { ...row, children: [] });
  });

  const tree: MenuTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.menu_id == null) {
      tree.push(node);
    } else {
      const parent = byId.get(node.menu_id);
      if (parent) parent.children.push(node);
      else tree.push(node);
    }
  }

  const sortByOrder = (a: MenuTreeNode, b: MenuTreeNode) =>
    a.menu_order - b.menu_order || a.id - b.id;
  tree.sort(sortByOrder);
  tree.forEach((n) => n.children.sort(sortByOrder));

  return ok(tree);
}

const createSchema = z.object({
  menu_name: z.string().min(1).max(255),
  url: z.string().max(255).optional().nullable(),
  text: z.string().max(100).optional().nullable(),
  icon: z.string().max(100).optional().nullable(),
  badge: z.string().max(50).optional().nullable(),
  menu_id: z.number().int().positive().nullable().optional(),
  menu_order: z.number().int().min(0).default(1),
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

    // Enforce 2-level rule: if parent is given, that parent must itself be top-level.
    let level = 0;
    if (d.menu_id) {
      const parent = await query<{ menu_level: number | null }>(
        `SELECT menu_level FROM menu_master_t WHERE id = $1`,
        [d.menu_id],
      );
      if (!parent.rows[0]) return fail('Parent menu not found', 400);
      if ((parent.rows[0].menu_level ?? 0) >= 1) {
        return fail('Only 2 levels of menus are supported', 400);
      }
      level = 1;
    }

    const result = await query(
      `INSERT INTO menu_master_t
         (menu_id, menu_order, menu_level, menu_name, url, text, icon, badge,
          created_by, updated_by, display)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'Y')
       RETURNING id, menu_id, menu_order, menu_level, menu_name, url, text, icon, badge, display`,
      [
        d.menu_id ?? null,
        d.menu_order,
        level,
        d.menu_name,
        d.url ?? '#',
        d.text ?? null,
        d.icon ?? null,
        d.badge ?? null,
        session.uid,
      ],
    );

    return ok(result.rows[0], 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[menus.POST]', err);
    return fail('Server error', 500);
  }
}
