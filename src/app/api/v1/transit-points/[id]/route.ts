import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  transitPointMaster,
  type TransitPointMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { transitPointUpdateSchema } from '@/schemas';

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
      id: transitPointMaster.id,
      transit_point_name: transitPointMaster.transitPointName,
      entry_point: transitPointMaster.entryPoint,
      exit_point: transitPointMaster.exitPoint,
      loading: transitPointMaster.loading,
      destination: transitPointMaster.destination,
      warehouse: transitPointMaster.warehouse,
      location: transitPointMaster.location,
      display: transitPointMaster.display,
      created_at: transitPointMaster.createdAt,
      updated_at: transitPointMaster.updatedAt,
    })
    .from(transitPointMaster)
    .where(eq(transitPointMaster.id, id))
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

  const data = transitPointUpdateSchema.parse(await req.json());

  const patch: Partial<TransitPointMasterInsert> = {};
  if (data.transit_point_name !== undefined)
    patch.transitPointName = data.transit_point_name;
  if (data.entry_point !== undefined) patch.entryPoint = data.entry_point;
  if (data.exit_point !== undefined) patch.exitPoint = data.exit_point;
  if (data.loading !== undefined) patch.loading = data.loading;
  if (data.destination !== undefined) patch.destination = data.destination;
  if (data.warehouse !== undefined) patch.warehouse = data.warehouse;
  if (data.location !== undefined) patch.location = data.location;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  const [row] = await db
    .update(transitPointMaster)
    .set(patch)
    .where(eq(transitPointMaster.id, id))
    .returning({ id: transitPointMaster.id });

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
    .update(transitPointMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(transitPointMaster.id, id))
    .returning({ id: transitPointMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
