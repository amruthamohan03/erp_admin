import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  dashboardCardMaster,
  menuMaster,
  type DashboardCardInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import { dashboardCardUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

  const [row] = await db
    .select({
      id: dashboardCardMaster.id,
      card_key: dashboardCardMaster.cardKey,
      card_content_id: dashboardCardMaster.cardContentId,
      card_title: dashboardCardMaster.cardTitle,
      card_subtitle: dashboardCardMaster.cardSubtitle,
      card_icon: dashboardCardMaster.cardIcon,
      card_color: dashboardCardMaster.cardColor,
      card_url: dashboardCardMaster.cardUrl,
      card_order: dashboardCardMaster.cardOrder,
      card_category: dashboardCardMaster.cardCategory,
      menu_id: dashboardCardMaster.menuId,
      menu_name: menuMaster.menuName,
      data_source: dashboardCardMaster.dataSource,
      display: dashboardCardMaster.display,
    })
    .from(dashboardCardMaster)
    .leftJoin(menuMaster, eq(menuMaster.id, dashboardCardMaster.menuId))
    .where(eq(dashboardCardMaster.id, id))
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

  const d = dashboardCardUpdateSchema.parse(await req.json());

  const patch: Partial<DashboardCardInsert> = {};
  if (d.card_key !== undefined) patch.cardKey = d.card_key;
  if (d.card_content_id !== undefined) patch.cardContentId = d.card_content_id;
  if (d.card_title !== undefined) patch.cardTitle = d.card_title;
  if (d.card_subtitle !== undefined) patch.cardSubtitle = d.card_subtitle;
  if (d.card_icon !== undefined) patch.cardIcon = d.card_icon;
  if (d.card_color !== undefined) patch.cardColor = d.card_color;
  if (d.card_url !== undefined) patch.cardUrl = d.card_url;
  if (d.card_order !== undefined) patch.cardOrder = d.card_order;
  if (d.card_category !== undefined) patch.cardCategory = d.card_category;
  if (d.menu_id !== undefined) patch.menuId = d.menu_id;
  if (d.data_source !== undefined) patch.dataSource = d.data_source;
  if (d.display !== undefined) patch.display = d.display;

  if (Object.keys(patch).length === 0) throw new BadRequestError('Nothing to update');

  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  try {
    const [row] = await db
      .update(dashboardCardMaster)
      .set(patch)
      .where(eq(dashboardCardMaster.id, id))
      .returning({ id: dashboardCardMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      throw new ConflictError('card_key already exists');
    }
    throw err;
  }
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) throw new BadRequestError('Invalid id');

  const [row] = await db
    .update(dashboardCardMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(dashboardCardMaster.id, id))
    .returning({ id: dashboardCardMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
