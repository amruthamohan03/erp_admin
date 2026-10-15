import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { provinceMaster, originMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { provinceCreateSchema, provinceListQuerySchema } from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = provinceListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    include_disabled: searchParams.get('include_disabled') ?? undefined,
    origin_id: searchParams.get('origin_id') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  // The master's own screen lists disabled rows too, so they can be switched back on.
  const conds: SQL[] = q.include_disabled ? [] : [eq(provinceMaster.display, 'Y')];
  if (q.q?.trim()) {
    conds.push(ilike(provinceMaster.provinceName, `%${q.q.trim()}%`));
  }
  if (q.origin_id) conds.push(eq(provinceMaster.originId, q.origin_id));
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(provinceMaster)
    .where(where);

  const items = await db
    .select({
      id: provinceMaster.id,
      province_name: provinceMaster.provinceName,
      origin_id: provinceMaster.originId,
      origin_name: originMaster.originName,
      display: provinceMaster.display,
      created_at: provinceMaster.createdAt,
      updated_at: provinceMaster.updatedAt,
    })
    .from(provinceMaster)
    .leftJoin(originMaster, eq(originMaster.id, provinceMaster.originId))
    .where(where)
    .orderBy(desc(provinceMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = provinceCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(provinceMaster)
    .values({
      provinceName: data.province_name,
      originId: data.origin_id ?? null,
      display: data.display ?? 'Y',
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: provinceMaster.id,
      province_name: provinceMaster.provinceName,
      origin_id: provinceMaster.originId,
      display: provinceMaster.display,
      created_at: provinceMaster.createdAt,
    });

  return ok(row, 201);
});
