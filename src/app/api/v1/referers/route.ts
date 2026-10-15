import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { refererMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { refererCreateSchema, refererListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = refererListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    include_disabled: searchParams.get('include_disabled') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = and(
    q.include_disabled ? undefined : eq(refererMaster.display, 'Y'),
    like
      ? ilike(refererMaster.refererName, like)
      : undefined,
  );

  const [countRow] = await db
    .select({ total: count() })
    .from(refererMaster)
    .where(where);

  const items = await db
    .select({
      id: refererMaster.id,
      referer_name: refererMaster.refererName,
      display: refererMaster.display,
      created_at: refererMaster.createdAt,
      updated_at: refererMaster.updatedAt,
    })
    .from(refererMaster)
    .where(where)
    .orderBy(desc(refererMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = refererCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(refererMaster)
    .values({
      refererName: data.referer_name,
      display: data.display ?? 'Y',
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: refererMaster.id,
      referer_name: refererMaster.refererName,
      display: refererMaster.display,
      created_at: refererMaster.createdAt,
    });

  return ok(row, 201);
});
