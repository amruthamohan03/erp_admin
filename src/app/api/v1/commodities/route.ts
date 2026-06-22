import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { commodityMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  commodityCreateSchema,
  commodityListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = commodityListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(commodityMaster.display, 'Y'),
        ilike(commodityMaster.commodityName, like),
      )
    : eq(commodityMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(commodityMaster)
    .where(where);

  const items = await db
    .select({
      id: commodityMaster.id,
      commodity_name: commodityMaster.commodityName,
      display: commodityMaster.display,
      created_at: commodityMaster.createdAt,
      updated_at: commodityMaster.updatedAt,
    })
    .from(commodityMaster)
    .where(where)
    .orderBy(desc(commodityMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = commodityCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(commodityMaster)
    .values({
      commodityName: data.commodity_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: commodityMaster.id,
      commodity_name: commodityMaster.commodityName,
      display: commodityMaster.display,
      created_at: commodityMaster.createdAt,
    });

  return ok(row, 201);
});
