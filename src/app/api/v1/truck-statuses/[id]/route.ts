import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  truckStatusMaster,
  type TruckStatusMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { truckStatusUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [row] = await db
      .select({
        id: truckStatusMaster.id,
        truck_status: truckStatusMaster.truckStatus,
        display: truckStatusMaster.display,
        created_at: truckStatusMaster.createdAt,
        updated_at: truckStatusMaster.updatedAt,
      })
      .from(truckStatusMaster)
      .where(eq(truckStatusMaster.id, id))
      .limit(1);

    if (!row) throw new NotFoundError();
    return ok(row);
  },
);

export const PUT = withErrorHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const data = truckStatusUpdateSchema.parse(await req.json());

    const patch: Partial<TruckStatusMasterInsert> = {};
    if (data.truck_status !== undefined) {
      patch.truckStatus = data.truck_status;
    }
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(truckStatusMaster)
      .set(patch)
      .where(eq(truckStatusMaster.id, id))
      .returning({ id: truckStatusMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);

export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [row] = await db
      .update(truckStatusMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(truckStatusMaster.id, id))
      .returning({ id: truckStatusMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
