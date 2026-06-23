import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { doneByMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { doneByCreateSchema, doneByListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = doneByListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(doneByMaster.display, 'Y'),
        ilike(doneByMaster.doneByName, like),
      )
    : eq(doneByMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(doneByMaster)
    .where(where);

  const items = await db
    .select({
      id: doneByMaster.id,
      done_by_name: doneByMaster.doneByName,
      display: doneByMaster.display,
      created_at: doneByMaster.createdAt,
      updated_at: doneByMaster.updatedAt,
    })
    .from(doneByMaster)
    .where(where)
    .orderBy(desc(doneByMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = doneByCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(doneByMaster)
    .values({
      doneByName: data.done_by_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: doneByMaster.id,
      done_by_name: doneByMaster.doneByName,
      display: doneByMaster.display,
      created_at: doneByMaster.createdAt,
    });

  return ok(row, 201);
});
