import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  dashboardCardMaster,
  roleDashboardCardMapping,
  roleMaster,
} from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

// GET /api/role-dashboard-card-mapping?role_id=N
// Returns every active card joined with the role's mapping row (if any).
// Cards with no mapping surface as is_visible=false so the matrix UI works.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const roleIdParam = searchParams.get('role_id');
  if (!roleIdParam) return fail('role_id is required', 400);
  const roleId = Number(roleIdParam);
  if (!Number.isInteger(roleId) || roleId <= 0) {
    return fail('role_id must be a positive integer', 400);
  }

  const [role] = await db
    .select({ id: roleMaster.id })
    .from(roleMaster)
    .where(and(eq(roleMaster.id, roleId), eq(roleMaster.display, 'Y')))
    .limit(1);
  if (!role) return fail('Role not found', 404);

  const rows = await db
    .select({
      card_id: dashboardCardMaster.id,
      card_key: dashboardCardMaster.cardKey,
      card_title: dashboardCardMaster.cardTitle,
      card_subtitle: dashboardCardMaster.cardSubtitle,
      card_icon: dashboardCardMaster.cardIcon,
      card_color: dashboardCardMaster.cardColor,
      card_category: dashboardCardMaster.cardCategory,
      default_order: dashboardCardMaster.cardOrder,
      is_visible: roleDashboardCardMapping.isVisible,
      role_order: roleDashboardCardMapping.cardOrder,
    })
    .from(dashboardCardMaster)
    .leftJoin(
      roleDashboardCardMapping,
      and(
        eq(roleDashboardCardMapping.cardId, dashboardCardMaster.id),
        eq(roleDashboardCardMapping.roleId, roleId),
      ),
    )
    .where(eq(dashboardCardMaster.display, 'Y'))
    .orderBy(
      asc(dashboardCardMaster.cardOrder),
      asc(dashboardCardMaster.id),
    );

  const data = rows.map((r) => ({
    ...r,
    is_visible: r.is_visible ?? false,
    role_order: r.role_order ?? r.default_order,
  }));

  return ok({ role_id: roleId, cards: data });
}

const mappingRow = z.object({
  card_id: z.number().int().positive(),
  is_visible: z.boolean().default(false),
  card_order: z.number().int().min(0).default(0),
});

const putSchema = z.object({
  role_id: z.number().int().positive(),
  mappings: z.array(mappingRow),
});

// PUT /api/role-dashboard-card-mapping
// Bulk upsert for one role. Rows where is_visible=false AND card_order=0 are
// removed to keep the mapping table free of all-default junk.
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const { role_id, mappings } = parsed.data;

    const [role] = await db
      .select({ id: roleMaster.id })
      .from(roleMaster)
      .where(eq(roleMaster.id, role_id))
      .limit(1);
    if (!role) return fail('Role not found', 404);

    const keep = mappings.filter((m) => m.is_visible || m.card_order > 0);
    const drop = mappings
      .filter((m) => !m.is_visible && m.card_order === 0)
      .map((m) => m.card_id);

    await db.transaction(async (tx) => {
      if (drop.length > 0) {
        await tx
          .delete(roleDashboardCardMapping)
          .where(
            and(
              eq(roleDashboardCardMapping.roleId, role_id),
              inArray(roleDashboardCardMapping.cardId, drop),
            ),
          );
      }

      if (keep.length === 0) return;

      const values = keep.map((m) => ({
        roleId: role_id,
        cardId: m.card_id,
        isVisible: m.is_visible,
        cardOrder: m.card_order,
        createdBy: session.uid,
        updatedBy: session.uid,
      }));

      await tx
        .insert(roleDashboardCardMapping)
        .values(values)
        .onConflictDoUpdate({
          target: [
            roleDashboardCardMapping.roleId,
            roleDashboardCardMapping.cardId,
          ],
          set: {
            isVisible: sql`excluded.is_visible`,
            cardOrder: sql`excluded.card_order`,
            updatedBy: session.uid,
            updatedAt: sql`now()`,
          },
        });
    });

    return ok({ role_id, saved: keep.length, removed: drop.length });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23503') return fail('Invalid role_id or card_id', 400);
    // eslint-disable-next-line no-console
    console.error('[role-dashboard-card-mapping.PUT]', err);
    return fail('Server error', 500);
  }
}
