import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
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

  const rows = await db.query.menuMaster.findMany({
    where: includeHidden ? undefined : eq(menuMaster.display, 'Y'),
    with: {
      parent: { columns: { menuName: true } },
      // Always loaded so we can compute role-scoped filtering below without
      // a second round-trip. Filtered to the user's role.
      roleMappings: {
        where: eq(roleMenuMapping.roleId, session.role_id),
        columns: { canView: true },
      },
    },
    orderBy: [asc(menuMaster.menuOrder), asc(menuMaster.id)],
  });

  type FlatRow = MenuItem & {
    parent_name: string | null;
    can_view: boolean;
  };

  const allFlat: FlatRow[] = rows.map((r) => ({
    id: r.id,
    menu_id: r.menuId,
    menu_order: r.menuOrder,
    menu_level: r.menuLevel,
    menu_name: r.menuName,
    url: r.url ?? '#',
    text: r.text,
    icon: r.icon,
    badge: r.badge,
    display: r.display as 'Y' | 'N',
    parent_name: r.parent?.menuName ?? null,
    can_view: r.roleMappings.some((m) => m.canView),
  }));

  // Role-scoped view: keep menus the role can view, plus auto-include any
  // parent whose child is viewable so the tree isn't orphaned.
  let kept: FlatRow[] = allFlat;
  if (!all) {
    const viewable = new Set<number>();
    for (const r of allFlat) {
      if (r.can_view) viewable.add(r.id);
    }
    for (const r of allFlat) {
      if (viewable.has(r.id) && r.menu_id != null) viewable.add(r.menu_id);
    }
    kept = allFlat.filter((r) => viewable.has(r.id));
  }

  const stripped: Array<MenuItem & { parent_name: string | null }> = kept.map(
    ({ can_view: _cv, ...rest }) => rest,
  );

  if (flat) return ok(stripped);

  const byId = new Map<number, MenuTreeNode>();
  stripped.forEach((row) => byId.set(row.id, { ...row, children: [] }));

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
      const p = await db.query.menuMaster.findFirst({
        where: eq(menuMaster.id, d.menu_id),
        columns: { menuLevel: true },
      });
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
