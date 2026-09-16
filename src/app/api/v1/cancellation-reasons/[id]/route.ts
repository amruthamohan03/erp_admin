import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  cancellationReasonMaster,
  type CancellationReasonMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { cancellationReasonUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Invalid id');
  return id;
}

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: raw } = await params;
  const id = parseId(raw);

  const [row] = await db
    .select({
      id: cancellationReasonMaster.id,
      reason_name: cancellationReasonMaster.reasonName,
      display: cancellationReasonMaster.display,
      created_at: cancellationReasonMaster.createdAt,
      updated_at: cancellationReasonMaster.updatedAt,
    })
    .from(cancellationReasonMaster)
    .where(eq(cancellationReasonMaster.id, id))
    .limit(1);

  if (!row) throw new NotFoundError();
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: raw } = await params;
  const id = parseId(raw);
  const data = cancellationReasonUpdateSchema.parse(await req.json());

  const patch: Partial<CancellationReasonMasterInsert> = {};
  if (data.reason_name !== undefined) patch.reasonName = data.reason_name;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) throw new BadRequestError('Nothing to update');
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  let row: { id: number } | undefined;
  try {
    [row] = await db
      .update(cancellationReasonMaster)
      .set(patch)
      .where(eq(cancellationReasonMaster.id, id))
      .returning({ id: cancellationReasonMaster.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'Reason');
    if (dup) return dup;
    throw err;
  }

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});

// §4.27 — deleting hides the row. A file already cancelled for this reason keeps
// pointing at it, so history still reads correctly.
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: raw } = await params;
  const id = parseId(raw);

  const [row] = await db
    .update(cancellationReasonMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(cancellationReasonMaster.id, id))
    .returning({ id: cancellationReasonMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
