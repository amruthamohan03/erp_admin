import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { menuMaster, roleMenuMapping } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import type { MenuItem, MenuTreeNode } from '@/types/menu';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const flat = searchParams.get('flat') === '1';
  const includeHidden = searchParams.get('includeHidden') === '1';
  // Admin/master screens need the full unfiltered list to manage menus;
  // every other caller (sidebar, etc.) gets the role-scoped view.
  const all = searchParams.get('all') === '1';

  const parent = alias(menuMaster, 'p');

  const baseQuery = db
    .select({
      id: menuMaster.id,
      menu_id: menuMaster.menuId,
      menu_order: menuMaster.menuOrder,
      menu_level: menuMaster.menuLevel,
      menu_name: menuMaster.menuName,
      url: menuMaster.url,
      text: menuMaster.text,
      icon: menuMaster.icon,
      badge: menuMaster.badge,
      display: menuMaster.display,
      parent_name: parent.menuName,
      can_view: roleMenuMapping.canView,
    })
    .from(menuMaster)
    .leftJoin(parent, eq(parent.id, menuMaster.menuId))
    .leftJoin(
      roleMenuMapping,
      and(
        eq(roleMenuMapping.menuId, menuMaster.id),
        eq(roleMenuMapping.roleId, session.role_id),
      ),
    );

  type RowWithView = MenuItem & {
    parent_name: string | null;
    can_view: boolean | null;
  };

  const allRows = (await (includeHidden
    ? baseQuery.orderBy(asc(menuMaster.menuOrder), asc(menuMaster.id))
    : baseQuery
        .where(eq(menuMaster.display, 'Y'))
        .orderBy(asc(menuMaster.menuOrder), asc(menuMaster.id)))) as RowWithView[];

  // Role-scoped view: keep menus the role can view, plus auto-include any
  // parent whose child is viewable so the tree isn't orphaned.
  let kept: RowWithView[] = allRows;
  if (!all) {
    const viewable = new Set<number>();
    for (const r of allRows) {
      if (r.can_view) viewable.add(r.id);
    }
    for (const r of allRows) {
      if (viewable.has(r.id) && r.menu_id != null) viewable.add(r.menu_id);
    }
    kept = allRows.filter((r) => viewable.has(r.id));
  }

  const rows: Array<MenuItem & { parent_name: string | null }> = kept.map(
    ({ can_view: _cv, ...rest }) => rest,
  );

  if (flat) {
    return ok(rows);
  }

  const byId = new Map<number, MenuTreeNode>();
  rows.forEach((row) => {
    byId.set(row.id, { ...row, children: [] });
  });

  const tree: MenuTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.menu_id == null) {
      tree.push(node);
    } else {
      const p = byId.get(node.menu_id);
      if (p) p.children.push(node);
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
      const [p] = await db
        .select({ menuLevel: menuMaster.menuLevel })
        .from(menuMaster)
        .where(eq(menuMaster.id, d.menu_id))
        .limit(1);
      if (!p) return fail('Parent menu not found', 400);
      if ((p.menuLevel ?? 0) >= 1) {
        return fail('Only 2 levels of menus are supported', 400);
      }
      level = 1;
    }

    const [row] = await db
      .insert(menuMaster)
      .values({
        menuId: d.menu_id ?? null,
        menuOrder: d.menu_order,
        menuLevel: level,
        menuName: d.menu_name,
        url: d.url ?? '#',
        text: d.text ?? null,
        icon: d.icon ?? null,
        badge: d.badge ?? null,
        createdBy: session.uid,
        updatedBy: session.uid,
        display: 'Y',
      })
      .returning({
        id: menuMaster.id,
        menu_id: menuMaster.menuId,
        menu_order: menuMaster.menuOrder,
        menu_level: menuMaster.menuLevel,
        menu_name: menuMaster.menuName,
        url: menuMaster.url,
        text: menuMaster.text,
        icon: menuMaster.icon,
        badge: menuMaster.badge,
        display: menuMaster.display,
      });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[menus.POST]', err);
    return fail('Server error', 500);
  }
}
