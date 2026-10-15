import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mainOfficeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { mainOfficeCreateSchema, mainOfficeListQuerySchema } from '@/schemas';

// GET /api/v1/main-offices?q=&page=&pageSize=
// List active main offices. Used by the Seals batch picker — a seal
// purchase batch is owned by a main office.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = mainOfficeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    include_disabled: searchParams.get('include_disabled') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = and(
    q.include_disabled ? undefined : eq(mainOfficeMaster.display, 'Y'),
    like
      ? ilike(mainOfficeMaster.mainLocationName, like)
      : undefined,
  );

  const [countRow] = await db
    .select({ total: count() })
    .from(mainOfficeMaster)
    .where(where);

  const items = await db
    .select({
      id: mainOfficeMaster.id,
      main_location_name: mainOfficeMaster.mainLocationName,
      display: mainOfficeMaster.display,
      created_at: mainOfficeMaster.createdAt,
      updated_at: mainOfficeMaster.updatedAt,
    })
    .from(mainOfficeMaster)
    .where(where)
    .orderBy(desc(mainOfficeMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = mainOfficeCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(mainOfficeMaster)
    .values({
      mainLocationName: data.main_location_name,
      display: data.display ?? 'Y',
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: mainOfficeMaster.id,
      main_location_name: mainOfficeMaster.mainLocationName,
      display: mainOfficeMaster.display,
      created_at: mainOfficeMaster.createdAt,
    });

  return ok(row, 201);
});
