import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { originMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { originCreateSchema, originListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = originListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(originMaster.display, 'Y'),
        ilike(originMaster.originName, like),
      )
    : eq(originMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(originMaster)
    .where(where);

  const items = await db
    .select({
      id: originMaster.id,
      origin_name: originMaster.originName,
      display: originMaster.display,
      created_at: originMaster.createdAt,
      updated_at: originMaster.updatedAt,
    })
    .from(originMaster)
    .where(where)
    .orderBy(desc(originMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = originCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(originMaster)
    .values({
      originName: data.origin_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: originMaster.id,
      origin_name: originMaster.originName,
      display: originMaster.display,
      created_at: originMaster.createdAt,
    });

  return ok(row, 201);
});
