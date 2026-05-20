import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, count, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { menuMaster, type MenuInsert } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const parent = alias(menuMaster, 'p');
  const [row] = await db
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
    })
    .from(menuMaster)
    .leftJoin(parent, eq(parent.id, menuMaster.menuId))
    .where(eq(menuMaster.id, id))
    .limit(1);

  if (!row) return fail('Not found', 404);
  return ok(row);
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
        const [p] = await db
          .select({ menuLevel: menuMaster.menuLevel })
          .from(menuMaster)
          .where(eq(menuMaster.id, d.menu_id))
          .limit(1);
        if (!p) return fail('Parent menu not found', 400);
        if ((p.menuLevel ?? 0) >= 1) {
          return fail('Only 2 levels of menus are supported', 400);
        }
        newLevel = 1;
      }

      // If this menu currently has children and we're trying to make it a child,
      // that would create a 3rd level. Block it.
      if (newLevel === 1) {
        const [kids] = await db
          .select({ count: count() })
          .from(menuMaster)
          .where(eq(menuMaster.menuId, id));
        if (kids.count > 0) {
          return fail(
            'This menu has children — cannot move it under another parent',
            400,
          );
        }
      }
    }

    const patch: Partial<MenuInsert> = {};
    if (d.menu_name !== undefined) patch.menuName = d.menu_name;
    if (d.url !== undefined) patch.url = d.url;
    if (d.text !== undefined) patch.text = d.text;
    if (d.icon !== undefined) patch.icon = d.icon;
    if (d.badge !== undefined) patch.badge = d.badge;
    if (d.menu_id !== undefined) patch.menuId = d.menu_id;
    if (newLevel !== undefined) patch.menuLevel = newLevel;
    if (d.menu_order !== undefined) patch.menuOrder = d.menu_order;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(menuMaster)
      .set(patch)
      .where(eq(menuMaster.id, id))
      .returning({ id: menuMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
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

  // Block deletion if active children exist
  const [kids] = await db
    .select({ count: count() })
    .from(menuMaster)
    .where(and(eq(menuMaster.menuId, id), eq(menuMaster.display, 'Y')));
  if (kids.count > 0) {
    return fail('Menu has active children — disable or move them first', 400);
  }

  const [row] = await db
    .update(menuMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(menuMaster.id, id))
    .returning({ id: menuMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
