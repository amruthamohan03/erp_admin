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
  // Optional group filter so import/export forms only offer their own kinds.
  //
  // Read from the `use_for_*` flags on the row, NOT from the kind's name. The
  // name-prefix test this replaced (`kind_name ILIKE 'EXPORT%'`) could not
  // express a kind that belongs to both — a temporary import leaves again as a
  // re-export — and quietly reclassified a kind whenever it was renamed (§4.1).
  const group = searchParams.get('group');
  const conds = [eq(kindMaster.display, 'Y')];
  if (like) conds.push(or(ilike(kindMaster.kindName, like), ilike(kindMaster.kindShortName, like))!);
  if (group === 'import') conds.push(eq(kindMaster.useForImport, true));
  else if (group === 'export') conds.push(eq(kindMaster.useForExport, true));
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
      use_for_import: kindMaster.useForImport,
      use_for_export: kindMaster.useForExport,
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
      useForImport: data.use_for_import,
      useForExport: data.use_for_export,
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: kindMaster.id,
      kind_name: kindMaster.kindName,
      kind_short_name: kindMaster.kindShortName,
      use_for_import: kindMaster.useForImport,
      use_for_export: kindMaster.useForExport,
      display: kindMaster.display,
      created_at: kindMaster.createdAt,
    });

  return ok(row, 201);
});
