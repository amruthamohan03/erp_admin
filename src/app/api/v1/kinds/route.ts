import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kindMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { kindCreateSchema, kindListQuerySchema } from '@/schemas';

// GET /api/v1/kinds?q=&page=&pageSize=
// List active quotation kinds. Search hits kind_name + kind_short_name.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = kindListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  // Optional group filter so import/export forms only offer their own kinds:
  // ?group=import → IMPORT %, ?group=export → EXPORT % (by kind_name prefix).
  const group = searchParams.get('group');
  const conds = [eq(kindMaster.display, 'Y')];
  if (like) conds.push(or(ilike(kindMaster.kindName, like), ilike(kindMaster.kindShortName, like))!);
  if (group === 'import') conds.push(ilike(kindMaster.kindName, 'IMPORT%'));
  else if (group === 'export') conds.push(ilike(kindMaster.kindName, 'EXPORT%'));
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(kindMaster)
    .where(where);

  const items = await db
    .select({
      id: kindMaster.id,
      kind_name: kindMaster.kindName,
      kind_short_name: kindMaster.kindShortName,
      display: kindMaster.display,
      created_at: kindMaster.createdAt,
      updated_at: kindMaster.updatedAt,
    })
    .from(kindMaster)
    .where(where)
    .orderBy(desc(kindMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = kindCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(kindMaster)
    .values({
      kindName: data.kind_name,
      kindShortName: data.kind_short_name,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: kindMaster.id,
      kind_name: kindMaster.kindName,
      kind_short_name: kindMaster.kindShortName,
      display: kindMaster.display,
      created_at: kindMaster.createdAt,
    });

  return ok(row, 201);
});
