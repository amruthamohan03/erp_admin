import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { partialMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { partialCreateSchema, partialListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = partialListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(eq(partialMaster.display, 'Y'), ilike(partialMaster.partialName, like))
    : eq(partialMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(partialMaster)
    .where(where);

  const items = await db
    .select({
      id: partialMaster.id,
      partial_name: partialMaster.partialName,
      display: partialMaster.display,
      created_at: partialMaster.createdAt,
      updated_at: partialMaster.updatedAt,
    })
    .from(partialMaster)
    .where(where)
    .orderBy(desc(partialMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = partialCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(partialMaster)
    .values({
      partialName: data.partial_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: partialMaster.id,
      partial_name: partialMaster.partialName,
      display: partialMaster.display,
      created_at: partialMaster.createdAt,
    });

  return ok(row, 201);
});
