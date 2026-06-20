import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { unitMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { unitCreateSchema, unitListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = unitListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(unitMaster.display, 'Y'),
        or(
          ilike(unitMaster.unitName, like),
          ilike(unitMaster.unitCode, like),
        ),
      )
    : eq(unitMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(unitMaster)
    .where(where);

  const items = await db
    .select({
      id: unitMaster.id,
      unit_name: unitMaster.unitName,
      unit_code: unitMaster.unitCode,
      display: unitMaster.display,
      created_at: unitMaster.createdAt,
      updated_at: unitMaster.updatedAt,
    })
    .from(unitMaster)
    .where(where)
    .orderBy(desc(unitMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = unitCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(unitMaster)
    .values({
      unitName: data.unit_name,
      unitCode: data.unit_code ?? null,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: unitMaster.id,
      unit_name: unitMaster.unitName,
      unit_code: unitMaster.unitCode,
      display: unitMaster.display,
      created_at: unitMaster.createdAt,
    });

  return ok(row, 201);
});
