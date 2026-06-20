import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kindMaster, type KindMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { kindUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [row] = await db
    .select({
      id: kindMaster.id,
      kind_name: kindMaster.kindName,
      kind_short_name: kindMaster.kindShortName,
      display: kindMaster.display,
      created_at: kindMaster.createdAt,
      updated_at: kindMaster.updatedAt,
    })
    .from(kindMaster)
    .where(eq(kindMaster.id, id))
    .limit(1);

  if (!row) throw new NotFoundError();
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const data = kindUpdateSchema.parse(await req.json());

  const patch: Partial<KindMasterInsert> = {};
  if (data.kind_name !== undefined) patch.kindName = data.kind_name;
  if (data.kind_short_name !== undefined) patch.kindShortName = data.kind_short_name;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  const [row] = await db
    .update(kindMaster)
    .set(patch)
    .where(eq(kindMaster.id, id))
    .returning({ id: kindMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [row] = await db
    .update(kindMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(kindMaster.id, id))
    .returning({ id: kindMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
