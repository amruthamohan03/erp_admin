// /api/v1/air-operating-companies — the Air Operating Companies master.
//
// GET is open to any signed-in user, not only to roles holding the master's
// menu: the Import Tracking Operating Company dropdown reads it, and an
// operator who may fill a file but not administer masters must still see the
// list. Writing is gated on the master's own menu (§4.7).
import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { airOperatingCompanyMaster } from '@/db/schema';
import { ok, requireAuth, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import {
  AIR_OPERATING_COMPANY_RESOURCE,
  airOperatingCompanyCreateSchema,
  airOperatingCompanyListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = airOperatingCompanyListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    include_disabled: searchParams.get('include_disabled') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = and(
    q.include_disabled ? undefined : eq(airOperatingCompanyMaster.display, 'Y'),
    like ? ilike(airOperatingCompanyMaster.airOperatingCompanyName, like) : undefined,
  );

  const [countRow] = await db.select({ total: count() }).from(airOperatingCompanyMaster).where(where);

  const items = await db
    .select({
      id: airOperatingCompanyMaster.id,
      air_operating_company_name: airOperatingCompanyMaster.airOperatingCompanyName,
      display: airOperatingCompanyMaster.display,
      created_at: airOperatingCompanyMaster.createdAt,
      updated_at: airOperatingCompanyMaster.updatedAt,
    })
    .from(airOperatingCompanyMaster)
    .where(where)
    .orderBy(desc(airOperatingCompanyMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, { meta: { total: countRow.total, page: q.page, pageSize: q.pageSize } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(AIR_OPERATING_COMPANY_RESOURCE, 'add');
  if (isResponse(session)) return session;

  const data = airOperatingCompanyCreateSchema.parse(await req.json());
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(airOperatingCompanyMaster)
      .values({
        airOperatingCompanyName: data.air_operating_company_name,
        display: data.display ?? 'Y',
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: airOperatingCompanyMaster.id,
        air_operating_company_name: airOperatingCompanyMaster.airOperatingCompanyName,
        display: airOperatingCompanyMaster.display,
        created_at: airOperatingCompanyMaster.createdAt,
      });
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'create',
      entityType: 'air_operating_company',
      entityId: String(created!.id),
      after: data,
    });
    return created!;
  });

  return ok(row, 201);
});
