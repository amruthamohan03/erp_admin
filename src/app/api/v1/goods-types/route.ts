import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { typeOfGoodsMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  goodsTypeCreateSchema,
  goodsTypeListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = goodsTypeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(typeOfGoodsMaster.display, 'Y'),
        or(
          ilike(typeOfGoodsMaster.goodsType, like),
          ilike(typeOfGoodsMaster.goodsShortName, like),
        ),
      )
    : eq(typeOfGoodsMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(typeOfGoodsMaster)
    .where(where);

  const items = await db
    .select({
      id: typeOfGoodsMaster.id,
      goods_type: typeOfGoodsMaster.goodsType,
      goods_short_name: typeOfGoodsMaster.goodsShortName,
      display: typeOfGoodsMaster.display,
      created_at: typeOfGoodsMaster.createdAt,
      updated_at: typeOfGoodsMaster.updatedAt,
    })
    .from(typeOfGoodsMaster)
    .where(where)
    .orderBy(desc(typeOfGoodsMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = goodsTypeCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(typeOfGoodsMaster)
    .values({
      goodsType: data.goods_type,
      goodsShortName: data.goods_short_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: typeOfGoodsMaster.id,
      goods_type: typeOfGoodsMaster.goodsType,
      goods_short_name: typeOfGoodsMaster.goodsShortName,
      display: typeOfGoodsMaster.display,
      created_at: typeOfGoodsMaster.createdAt,
    });

  return ok(row, 201);
});
