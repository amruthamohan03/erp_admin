import { NextRequest } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  dashboardCardMaster,
  roleDashboardCardMapping,
  roleMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { roleDashboardCardMappingPutSchema } from '@/schemas';

// GET /api/v1/role-dashboard-card-mapping?role_id=N
// Returns every active card joined with the role's mapping row (if any).
// Cards with no mapping surface as is_visible=false so the matrix UI works.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const roleIdParam = searchParams.get('role_id');
  if (!roleIdParam) throw new BadRequestError('role_id is required');
  const roleId = Number(roleIdParam);
  if (!Number.isInteger(roleId) || roleId <= 0) {
    throw new BadRequestError('role_id must be a positive integer');
  }

  const [role] = await db
    .select({ id: roleMaster.id })
    .from(roleMaster)
    .where(and(eq(roleMaster.id, roleId), eq(roleMaster.display, 'Y')))
    .limit(1);
  if (!role) throw new NotFoundError('Role not found');

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
});

// PUT /api/v1/role-dashboard-card-mapping
// Bulk upsert for one role. Rows where is_visible=false AND card_order=0 are
// removed to keep the mapping table free of all-default junk.
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { role_id, mappings } = roleDashboardCardMappingPutSchema.parse(await req.json());

  const [role] = await db
    .select({ id: roleMaster.id })
    .from(roleMaster)
    .where(eq(roleMaster.id, role_id))
    .limit(1);
  if (!role) throw new NotFoundError('Role not found');

  const keep = mappings.filter((m) => m.is_visible || m.card_order > 0);
  const drop = mappings
    .filter((m) => !m.is_visible && m.card_order === 0)
    .map((m) => m.card_id);

  try {
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
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23503') {
      throw new BadRequestError('Invalid role_id or card_id');
    }
    throw err;
  }

  return ok({ role_id, saved: keep.length, removed: drop.length });
});
