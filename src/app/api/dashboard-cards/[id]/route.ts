import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  dashboardCardMaster,
  type DashboardCardInsert,
} from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const c = await db.query.dashboardCardMaster.findFirst({
    where: eq(dashboardCardMaster.id, id),
    with: {
      menu: { columns: { menuName: true } },
    },
  });

  if (!c) return fail('Not found', 404);
  return ok({
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
  });
}

const updateSchema = z.object({
  card_key: z.string().min(1).max(50).optional(),
  card_content_id: z.string().min(1).max(50).optional(),
  card_title: z.string().min(1).max(100).optional(),
  card_subtitle: z.string().max(100).optional().nullable(),
  card_icon: z.string().max(50).optional().nullable(),
  card_color: z.string().max(30).optional().nullable(),
  card_url: z.string().max(255).optional().nullable(),
  card_order: z.number().int().min(0).optional(),
  card_category: z.string().max(50).optional().nullable(),
  menu_id: z.number().int().positive().nullable().optional(),
  data_source: z.string().max(255).optional().nullable(),
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

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(dashboardCardMaster)
      .set(patch)
      .where(eq(dashboardCardMaster.id, id))
      .returning({ id: dashboardCardMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') return fail('card_key already exists', 409);
    // eslint-disable-next-line no-console
    console.error('[dashboard-cards.PUT]', err);
    return fail('Server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .update(dashboardCardMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(dashboardCardMaster.id, id))
    .returning({ id: dashboardCardMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
