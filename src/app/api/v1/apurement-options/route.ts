// /api/v1/apurement-options — the Apurement Options master: the Type and
// Remarque choices on Import Apurement's pending grid.
//
// GET is open to any signed-in user, not only to roles holding the master's
// menu: the grid reads it, and an operator who may record apurement but not
// administer masters must still see the choices. Writing is gated on the
// master's own menu (§4.7).
import { NextRequest } from 'next/server';
import { and, asc, count, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { apurementOptionMaster } from '@/db/schema';
import { ok, requireAuth, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import {
  APUREMENT_OPTION_RESOURCE,
  apurementOptionCreateSchema,
  apurementOptionListQuerySchema,
} from '@/schemas';

export const apurementOptionSelection = {
  id: apurementOptionMaster.id,
  option_group: apurementOptionMaster.optionGroup,
  option_name: apurementOptionMaster.optionName,
  requires_remark: apurementOptionMaster.requiresRemark,
  display: apurementOptionMaster.display,
  created_at: apurementOptionMaster.createdAt,
  updated_at: apurementOptionMaster.updatedAt,
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = apurementOptionListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    group: searchParams.get('group') ?? undefined,
    include_disabled: searchParams.get('include_disabled') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = and(
    q.include_disabled ? undefined : eq(apurementOptionMaster.display, 'Y'),
    q.group ? eq(apurementOptionMaster.optionGroup, q.group) : undefined,
    like ? ilike(apurementOptionMaster.optionName, like) : undefined,
  );

  const [countRow] = await db.select({ total: count() }).from(apurementOptionMaster).where(where);
  const items = await db
    .select(apurementOptionSelection)
    .from(apurementOptionMaster)
    .where(where)
    // §4.16 — id order, the order the options were created in.
    .orderBy(asc(apurementOptionMaster.optionGroup), asc(apurementOptionMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, { meta: { total: countRow.total, page: q.page, pageSize: q.pageSize } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(APUREMENT_OPTION_RESOURCE, 'add');
  if (isResponse(session)) return session;

  const data = apurementOptionCreateSchema.parse(await req.json());
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(apurementOptionMaster)
      .values({
        optionGroup: data.option_group,
        optionName: data.option_name,
        // Only a Type can demand a Remarque; on a Remarque the flag means nothing.
        requiresRemark: data.option_group === 'type' ? (data.requires_remark ?? false) : false,
        display: data.display ?? 'Y',
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning(apurementOptionSelection);
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'create',
      entityType: 'apurement_option',
      entityId: String(created!.id),
      module: 'masters',
      after: data,
    });
    return created!;
  });

  return ok(row, 201);
});
