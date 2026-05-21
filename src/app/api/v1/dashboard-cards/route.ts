import { NextRequest } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dashboardCardMaster, menuMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { ConflictError } from '@/lib/errors';
import { dashboardCardCreateSchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const includeHidden = searchParams.get('includeHidden') === '1';
  const menuIdParam = searchParams.get('menu_id');

  const conds = [] as ReturnType<typeof eq>[];
  if (!includeHidden) conds.push(eq(dashboardCardMaster.display, 'Y'));
  if (menuIdParam) {
    const mid = Number(menuIdParam);
    if (Number.isInteger(mid) && mid > 0) {
      conds.push(eq(dashboardCardMaster.menuId, mid));
    }
  }

  const rows = await db
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
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(
      asc(dashboardCardMaster.cardOrder),
      asc(dashboardCardMaster.id),
    );

  return ok(rows);
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const d = dashboardCardCreateSchema.parse(await req.json());

  try {
    const [row] = await db
      .insert(dashboardCardMaster)
      .values({
        cardKey: d.card_key,
        cardContentId: d.card_content_id,
        cardTitle: d.card_title,
        cardSubtitle: d.card_subtitle ?? null,
        cardIcon: d.card_icon ?? 'bi-card-text',
        cardColor: d.card_color ?? 'primary',
        cardUrl: d.card_url ?? null,
        cardOrder: d.card_order,
        cardCategory: d.card_category ?? 'general',
        menuId: d.menu_id ?? null,
        dataSource: d.data_source ?? null,
        createdBy: session.uid,
        updatedBy: session.uid,
        display: 'Y',
      })
      .returning({ id: dashboardCardMaster.id });
    return ok(row, 201);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      throw new ConflictError('card_key already exists');
    }
    throw err;
  }
});
