import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transitPointMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  transitPointCreateSchema,
  transitPointListQuerySchema,
} from '@/schemas';

// Capability column lookup. The route receives `capability=entry_point`
// (or one of the other 5) and filters to rows where that bool is true.
// This is what the imports/exports field renderer uses to populate a
// transit-point picker scoped to its specific FK role.
const CAPABILITY_COLUMNS = {
  entry_point: transitPointMaster.entryPoint,
  exit_point: transitPointMaster.exitPoint,
  loading: transitPointMaster.loading,
  destination: transitPointMaster.destination,
  warehouse: transitPointMaster.warehouse,
  location: transitPointMaster.location,
} as const;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = transitPointListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    capability: searchParams.get('capability') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(transitPointMaster.display, 'Y')];
  if (q.q?.trim()) {
    conds.push(ilike(transitPointMaster.transitPointName, `%${q.q.trim()}%`));
  }
  if (q.capability) {
    conds.push(eq(CAPABILITY_COLUMNS[q.capability], true));
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(transitPointMaster)
    .where(where);

  const items = await db
    .select({
      id: transitPointMaster.id,
      transit_point_name: transitPointMaster.transitPointName,
      entry_point: transitPointMaster.entryPoint,
      exit_point: transitPointMaster.exitPoint,
      loading: transitPointMaster.loading,
      destination: transitPointMaster.destination,
      warehouse: transitPointMaster.warehouse,
      location: transitPointMaster.location,
      display: transitPointMaster.display,
      created_at: transitPointMaster.createdAt,
      updated_at: transitPointMaster.updatedAt,
    })
    .from(transitPointMaster)
    .where(where)
    .orderBy(desc(transitPointMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = transitPointCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(transitPointMaster)
    .values({
      transitPointName: data.transit_point_name,
      entryPoint: data.entry_point,
      exitPoint: data.exit_point,
      loading: data.loading,
      destination: data.destination,
      warehouse: data.warehouse,
      location: data.location,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: transitPointMaster.id,
      transit_point_name: transitPointMaster.transitPointName,
      entry_point: transitPointMaster.entryPoint,
      exit_point: transitPointMaster.exitPoint,
      loading: transitPointMaster.loading,
      destination: transitPointMaster.destination,
      warehouse: transitPointMaster.warehouse,
      location: transitPointMaster.location,
      display: transitPointMaster.display,
      created_at: transitPointMaster.createdAt,
    });

  return ok(row, 201);
});
