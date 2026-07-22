import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { regimeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { regimeCreateSchema, regimeListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = regimeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const conditions = [eq(regimeMaster.display, 'Y')];
  if (like) conditions.push(ilike(regimeMaster.regimeName, like));
  if (q.type) conditions.push(eq(regimeMaster.type, q.type));
  const where = and(...conditions);

  const [countRow] = await db
    .select({ total: count() })
    .from(regimeMaster)
    .where(where);

  const items = await db
    .select({
      id: regimeMaster.id,
      regime_name: regimeMaster.regimeName,
      type: regimeMaster.type,
      display: regimeMaster.display,
      created_at: regimeMaster.createdAt,
      updated_at: regimeMaster.updatedAt,
    })
    .from(regimeMaster)
    .where(where)
    .orderBy(desc(regimeMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = regimeCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(regimeMaster)
    .values({
      regimeName: data.regime_name,
      type: data.type,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: regimeMaster.id,
      regime_name: regimeMaster.regimeName,
      type: regimeMaster.type,
      display: regimeMaster.display,
      created_at: regimeMaster.createdAt,
    });

  return ok(row, 201);
});
