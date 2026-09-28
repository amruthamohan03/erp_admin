import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hsGreenPrefixMaster, type HsGreenPrefixInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { hsGreenPrefixUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

function parseId(idStr: string): number {
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Invalid id');
  return id;
}

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseId(idStr);

  const [row] = await db
    .select({
      id: hsGreenPrefixMaster.id,
      prefix: hsGreenPrefixMaster.prefix,
      note: hsGreenPrefixMaster.note,
      display: hsGreenPrefixMaster.display,
      created_at: hsGreenPrefixMaster.createdAt,
      updated_at: hsGreenPrefixMaster.updatedAt,
    })
    .from(hsGreenPrefixMaster)
    .where(eq(hsGreenPrefixMaster.id, id))
    .limit(1);

  if (!row) throw new NotFoundError();
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseId(idStr);

  const data = hsGreenPrefixUpdateSchema.parse(await req.json());

  const patch: Partial<HsGreenPrefixInsert> = {};
  if (data.prefix !== undefined) patch.prefix = data.prefix;
  // `null` clears the note; `undefined` leaves it. An empty string is the form
  // saying "cleared", so it lands as NULL rather than as a blank column.
  if (data.note !== undefined) patch.note = data.note?.trim() || null;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  let row: { id: number } | undefined;
  try {
    [row] = await db
      .update(hsGreenPrefixMaster)
      .set(patch)
      .where(eq(hsGreenPrefixMaster.id, id))
      .returning({ id: hsGreenPrefixMaster.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'HS code prefix');
    if (dup) return dup;
    throw err;
  }

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseId(idStr);

  // §4.27 — deleting a rule hides it; the codes it covered fall back to their
  // own override, which for almost all of them means "not required".
  const [row] = await db
    .update(hsGreenPrefixMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(hsGreenPrefixMaster.id, id))
    .returning({ id: hsGreenPrefixMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
