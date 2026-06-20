import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { transportModeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  transportModeCreateSchema,
  transportModeListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = transportModeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(transportModeMaster.display, 'Y'),
        or(
          ilike(transportModeMaster.transportModeName, like),
          ilike(transportModeMaster.transportLetter, like),
        ),
      )
    : eq(transportModeMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(transportModeMaster)
    .where(where);

  const items = await db
    .select({
      id: transportModeMaster.id,
      transport_mode_name: transportModeMaster.transportModeName,
      transport_letter: transportModeMaster.transportLetter,
      display: transportModeMaster.display,
      created_at: transportModeMaster.createdAt,
      updated_at: transportModeMaster.updatedAt,
    })
    .from(transportModeMaster)
    .where(where)
    .orderBy(desc(transportModeMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = transportModeCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(transportModeMaster)
    .values({
      transportModeName: data.transport_mode_name,
      transportLetter: data.transport_letter,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: transportModeMaster.id,
      transport_mode_name: transportModeMaster.transportModeName,
      transport_letter: transportModeMaster.transportLetter,
      display: transportModeMaster.display,
      created_at: transportModeMaster.createdAt,
    });

  return ok(row, 201);
});
