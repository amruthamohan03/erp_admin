import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { officeLocationMaster, provinceMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  officeLocationCreateSchema,
  officeLocationListQuerySchema,
} from '@/schemas';

// GET /api/v1/office-locations?q=&page=&pageSize=
// List active office locations joined to their province. Used by
// client onboarding (client_master_t.office_location_id) for the
// issuing-office picker.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = officeLocationListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(officeLocationMaster.display, 'Y'),
        or(
          ilike(officeLocationMaster.locationName, like),
          ilike(provinceMaster.provinceName, like),
        ),
      )
    : eq(officeLocationMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(officeLocationMaster)
    .leftJoin(
      provinceMaster,
      eq(officeLocationMaster.provinceId, provinceMaster.id),
    )
    .where(where);

  const items = await db
    .select({
      id: officeLocationMaster.id,
      location_name: officeLocationMaster.locationName,
      province_id: officeLocationMaster.provinceId,
      province_name: provinceMaster.provinceName,
      display: officeLocationMaster.display,
      created_at: officeLocationMaster.createdAt,
      updated_at: officeLocationMaster.updatedAt,
    })
    .from(officeLocationMaster)
    .leftJoin(
      provinceMaster,
      eq(officeLocationMaster.provinceId, provinceMaster.id),
    )
    .where(where)
    .orderBy(desc(officeLocationMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = officeLocationCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(officeLocationMaster)
    .values({
      locationName: data.location_name,
      provinceId: data.province_id ?? null,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: officeLocationMaster.id,
      location_name: officeLocationMaster.locationName,
      display: officeLocationMaster.display,
      created_at: officeLocationMaster.createdAt,
    });

  return ok(row, 201);
});
