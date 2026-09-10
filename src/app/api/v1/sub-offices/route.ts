import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { subOfficeMaster, mainOfficeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  subOfficeCreateSchema,
  subOfficeListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = subOfficeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    main_office_id: searchParams.get('main_office_id') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(subOfficeMaster.display, 'Y')];
  if (q.main_office_id) conds.push(eq(subOfficeMaster.mainOfficeId, q.main_office_id));
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    // The region is a column on the grid now, so it has to be searchable:
    // typing what is on screen must return the row showing it (§4.15).
    const match = or(
      ilike(subOfficeMaster.subOfficeName, like),
      ilike(mainOfficeMaster.mainLocationName, like),
    );
    if (match) conds.push(match);
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(subOfficeMaster)
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, subOfficeMaster.mainOfficeId))
    .where(where);

  const items = await db
    .select({
      id: subOfficeMaster.id,
      sub_office_name: subOfficeMaster.subOfficeName,
      main_office_id: subOfficeMaster.mainOfficeId,
      main_office_name: mainOfficeMaster.mainLocationName,
      display: subOfficeMaster.display,
      created_at: subOfficeMaster.createdAt,
      updated_at: subOfficeMaster.updatedAt,
    })
    .from(subOfficeMaster)
    // LEFT: a desk with no region assigned yet must still appear — it is
    // exactly the row somebody has to open and fix.
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, subOfficeMaster.mainOfficeId))
    .where(where)
    .orderBy(desc(subOfficeMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = subOfficeCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(subOfficeMaster)
    .values({
      subOfficeName: data.sub_office_name,
      mainOfficeId: data.main_office_id,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: subOfficeMaster.id,
      sub_office_name: subOfficeMaster.subOfficeName,
      main_office_id: subOfficeMaster.mainOfficeId,
      display: subOfficeMaster.display,
      created_at: subOfficeMaster.createdAt,
    });

  return ok(row, 201);
});
