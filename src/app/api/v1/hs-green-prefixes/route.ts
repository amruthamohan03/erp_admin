import { NextRequest } from 'next/server';
import { and, asc, count, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hsGreenPrefixMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import { hsGreenPrefixCreateSchema, hsGreenPrefixListQuerySchema } from '@/schemas';

// The standing green-certificate rule: HS codes starting with these digits
// need an environmental clearance (§4.1). The per-code flag on
// hscode_master_t stays as the override.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = hsGreenPrefixListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  // Both columns, because the note is what an operator remembers a rule by —
  // showing a field and searching a different one is the §4.15 defect.
  const where = like
    ? and(
        eq(hsGreenPrefixMaster.display, 'Y'),
        or(
          ilike(hsGreenPrefixMaster.prefix, like),
          ilike(hsGreenPrefixMaster.note, like),
        ),
      )
    : eq(hsGreenPrefixMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(hsGreenPrefixMaster)
    .where(where);

  const items = await db
    .select({
      id: hsGreenPrefixMaster.id,
      prefix: hsGreenPrefixMaster.prefix,
      note: hsGreenPrefixMaster.note,
      display: hsGreenPrefixMaster.display,
      created_at: hsGreenPrefixMaster.createdAt,
      updated_at: hsGreenPrefixMaster.updatedAt,
    })
    .from(hsGreenPrefixMaster)
    .where(where)
    // Ascending: the rules read as a list of ranges, and 0301 before 4403 is
    // how an operator scans for whether something is already covered.
    .orderBy(asc(hsGreenPrefixMaster.prefix))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = hsGreenPrefixCreateSchema.parse(await req.json());
  try {
    const [row] = await db
      .insert(hsGreenPrefixMaster)
      .values({
        prefix: data.prefix,
        note: data.note?.trim() || null,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: hsGreenPrefixMaster.id,
        prefix: hsGreenPrefixMaster.prefix,
        note: hsGreenPrefixMaster.note,
        display: hsGreenPrefixMaster.display,
        created_at: hsGreenPrefixMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // Unique on the digits, so `03.01` collides with an existing `0301` — the
    // message has to name the prefix or the operator cannot see why (§4.23).
    const dup = uniqueViolationResponse(err, 'HS code prefix');
    if (dup) return dup;
    throw err;
  }
});
