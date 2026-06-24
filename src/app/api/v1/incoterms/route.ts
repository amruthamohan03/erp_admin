import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { incotermMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { incotermCreateSchema, incotermListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = incotermListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(incotermMaster.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(incotermMaster.incotermShortName, like),
      ilike(incotermMaster.incotermFullName, like),
    );
    if (orClause) conds.push(orClause);
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(incotermMaster)
    .where(where);

  const items = await db
    .select({
      id: incotermMaster.id,
      incoterm_short_name: incotermMaster.incotermShortName,
      incoterm_full_name: incotermMaster.incotermFullName,
      display: incotermMaster.display,
      created_at: incotermMaster.createdAt,
      updated_at: incotermMaster.updatedAt,
    })
    .from(incotermMaster)
    .where(where)
    .orderBy(desc(incotermMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = incotermCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(incotermMaster)
    .values({
      incotermShortName: data.incoterm_short_name,
      incotermFullName: data.incoterm_full_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: incotermMaster.id,
      incoterm_short_name: incotermMaster.incotermShortName,
      incoterm_full_name: incotermMaster.incotermFullName,
      display: incotermMaster.display,
      created_at: incotermMaster.createdAt,
    });

  return ok(row, 201);
});
