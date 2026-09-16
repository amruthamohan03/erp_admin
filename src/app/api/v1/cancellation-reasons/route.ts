import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cancellationReasonMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import {
  cancellationReasonCreateSchema,
  cancellationReasonListQuerySchema,
} from '@/schemas';

// §4.1 — why a tracking file was cancelled. Feeds the `cancellation_reason_id`
// field on the Import, Export and Local pages, which only appears once the file
// is actually CANCELLED (§4.12).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = cancellationReasonListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const like = q.q?.trim() ? `%${q.q.trim()}%` : null;
  const where = like
    ? and(
        eq(cancellationReasonMaster.display, 'Y'),
        ilike(cancellationReasonMaster.reasonName, like),
      )
    : eq(cancellationReasonMaster.display, 'Y');

  const [countRow] = await db
    .select({ total: count() })
    .from(cancellationReasonMaster)
    .where(where);

  const items = await db
    .select({
      id: cancellationReasonMaster.id,
      reason_name: cancellationReasonMaster.reasonName,
      display: cancellationReasonMaster.display,
      created_at: cancellationReasonMaster.createdAt,
      updated_at: cancellationReasonMaster.updatedAt,
    })
    .from(cancellationReasonMaster)
    .where(where)
    .orderBy(desc(cancellationReasonMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = cancellationReasonCreateSchema.parse(await req.json());
  try {
    const [row] = await db
      .insert(cancellationReasonMaster)
      .values({
        reasonName: data.reason_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: cancellationReasonMaster.id,
        reason_name: cancellationReasonMaster.reasonName,
        display: cancellationReasonMaster.display,
        created_at: cancellationReasonMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'Reason');
    if (dup) return dup;
    throw err;
  }
});
