import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { truckStatusMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  truckStatusCreateSchema,
  truckStatusListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = truckStatusListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(truckStatusMaster.display, 'Y'),
        ilike(truckStatusMaster.truckStatus, like),
      )
    : eq(truckStatusMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(truckStatusMaster)
    .where(where);

  const items = await db
    .select({
      id: truckStatusMaster.id,
      truck_status: truckStatusMaster.truckStatus,
      display: truckStatusMaster.display,
      created_at: truckStatusMaster.createdAt,
      updated_at: truckStatusMaster.updatedAt,
    })
    .from(truckStatusMaster)
    .where(where)
    .orderBy(desc(truckStatusMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = truckStatusCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(truckStatusMaster)
    .values({
      truckStatus: data.truck_status,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: truckStatusMaster.id,
      truck_status: truckStatusMaster.truckStatus,
      display: truckStatusMaster.display,
      created_at: truckStatusMaster.createdAt,
    });

  return ok(row, 201);
});
