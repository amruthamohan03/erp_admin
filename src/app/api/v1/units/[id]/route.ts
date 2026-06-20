import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { unitMaster, type UnitMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { unitUpdateSchema } from '@/schemas';

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
      id: unitMaster.id,
      unit_name: unitMaster.unitName,
      unit_code: unitMaster.unitCode,
      display: unitMaster.display,
      created_at: unitMaster.createdAt,
      updated_at: unitMaster.updatedAt,
    })
    .from(unitMaster)
    .where(eq(unitMaster.id, id))
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

  const data = unitUpdateSchema.parse(await req.json());

  const patch: Partial<UnitMasterInsert> = {};
  if (data.unit_name !== undefined) patch.unitName = data.unit_name;
  if (data.unit_code !== undefined) patch.unitCode = data.unit_code;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  const [row] = await db
    .update(unitMaster)
    .set(patch)
    .where(eq(unitMaster.id, id))
    .returning({ id: unitMaster.id });

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
    .update(unitMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(unitMaster.id, id))
    .returning({ id: unitMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
