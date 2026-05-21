import { NextRequest } from 'next/server';
import { and, count, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { menuMaster, type MenuInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { menuUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

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

  if (!row) throw new NotFoundError();
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

  const d = menuUpdateSchema.parse(await req.json());

  // Block self-parenting
  if (d.menu_id === id) throw new BadRequestError('A menu cannot be its own parent');

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
      if (!p) throw new BadRequestError('Parent menu not found');
      if ((p.menuLevel ?? 0) >= 1) {
        throw new BadRequestError('Only 2 levels of menus are supported');
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
        throw new BadRequestError(
          'This menu has children — cannot move it under another parent',
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

  if (Object.keys(patch).length === 0) throw new BadRequestError('Nothing to update');

  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  const [row] = await db
    .update(menuMaster)
    .set(patch)
    .where(eq(menuMaster.id, id))
    .returning({ id: menuMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

  // Block deletion if active children exist
  const [kids] = await db
    .select({ count: count() })
    .from(menuMaster)
    .where(and(eq(menuMaster.menuId, id), eq(menuMaster.display, 'Y')));
  if (kids.count > 0) {
    throw new BadRequestError('Menu has active children — disable or move them first');
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

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
