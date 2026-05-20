import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dashboardCardMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const includeHidden = searchParams.get('includeHidden') === '1';
  const menuIdParam = searchParams.get('menu_id');

  const conds: SQL[] = [];
  if (!includeHidden) conds.push(eq(dashboardCardMaster.display, 'Y'));
  if (menuIdParam) {
    const mid = Number(menuIdParam);
    if (Number.isInteger(mid) && mid > 0) {
      conds.push(eq(dashboardCardMaster.menuId, mid));
    }
  }

  const rows = await db.query.dashboardCardMaster.findMany({
    where: conds.length > 0 ? and(...conds) : undefined,
    with: {
      menu: { columns: { menuName: true } },
    },
    orderBy: [asc(dashboardCardMaster.cardOrder), asc(dashboardCardMaster.id)],
  });

  return ok(
    rows.map((c) => ({
      id: c.id,
      card_key: c.cardKey,
      card_content_id: c.cardContentId,
      card_title: c.cardTitle,
      card_subtitle: c.cardSubtitle,
      card_icon: c.cardIcon,
      card_color: c.cardColor,
      card_url: c.cardUrl,
      card_order: c.cardOrder,
      card_category: c.cardCategory,
      menu_id: c.menuId,
      menu_name: c.menu?.menuName ?? null,
      data_source: c.dataSource,
      display: c.display,
    })),
  );
}

const createSchema = z.object({
  card_key: z.string().min(1).max(50),
  card_content_id: z.string().min(1).max(50),
  card_title: z.string().min(1).max(100),
  card_subtitle: z.string().max(100).optional().nullable(),
  card_icon: z.string().max(50).optional().nullable(),
  card_color: z.string().max(30).optional().nullable(),
  card_url: z.string().max(255).optional().nullable(),
  card_order: z.number().int().min(0).default(0),
  card_category: z.string().max(50).optional().nullable(),
  menu_id: z.number().int().positive().nullable().optional(),
  data_source: z.string().max(255).optional().nullable(),
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
    const e = err as { code?: string };
    if (e.code === '23505') return fail('card_key already exists', 409);
    // eslint-disable-next-line no-console
    console.error('[dashboard-cards.POST]', err);
    return fail('Server error', 500);
  }
}
