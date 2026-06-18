import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { officeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { officeCreateSchema, officeListQuerySchema } from '@/schemas';

// GET /api/v1/offices?q=&page=&pageSize=
// List active office locations. Used by Seals (and any future module
// that picks an office) for the dropdown — the Seals batch picker
// loads from here.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = officeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(officeMaster.display, 'Y'),
        ilike(officeMaster.locationName, like),
      )
    : eq(officeMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(officeMaster)
    .where(where);

  const items = await db
    .select({
      id: officeMaster.id,
      location_name: officeMaster.locationName,
      display: officeMaster.display,
      created_at: officeMaster.createdAt,
      updated_at: officeMaster.updatedAt,
    })
    .from(officeMaster)
    .where(where)
    .orderBy(desc(officeMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = officeCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(officeMaster)
    .values({
      locationName: data.location_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: officeMaster.id,
      location_name: officeMaster.locationName,
      display: officeMaster.display,
      created_at: officeMaster.createdAt,
    });

  return ok(row, 201);
});
