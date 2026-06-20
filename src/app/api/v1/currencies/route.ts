import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { currencyMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { currencyCreateSchema, currencyListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = currencyListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(currencyMaster.display, 'Y'),
        or(
          ilike(currencyMaster.currencyName, like),
          ilike(currencyMaster.currencyShortName, like),
        ),
      )
    : eq(currencyMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(currencyMaster)
    .where(where);

  const items = await db
    .select({
      id: currencyMaster.id,
      currency_name: currencyMaster.currencyName,
      currency_short_name: currencyMaster.currencyShortName,
      display: currencyMaster.display,
      created_at: currencyMaster.createdAt,
      updated_at: currencyMaster.updatedAt,
    })
    .from(currencyMaster)
    .where(where)
    .orderBy(desc(currencyMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = currencyCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(currencyMaster)
    .values({
      currencyName: data.currency_name,
      currencyShortName: data.currency_short_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: currencyMaster.id,
      currency_name: currencyMaster.currencyName,
      currency_short_name: currencyMaster.currencyShortName,
      display: currencyMaster.display,
      created_at: currencyMaster.createdAt,
    });

  return ok(row, 201);
});
