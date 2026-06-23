import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  feetContainerMaster,
  type FeetContainerMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { feetContainerUpdateSchema } from '@/schemas';

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
        id: feetContainerMaster.id,
        feet_container_size: feetContainerMaster.feetContainerSize,
        display: feetContainerMaster.display,
        created_at: feetContainerMaster.createdAt,
        updated_at: feetContainerMaster.updatedAt,
      })
      .from(feetContainerMaster)
      .where(eq(feetContainerMaster.id, id))
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

    const data = feetContainerUpdateSchema.parse(await req.json());

    const patch: Partial<FeetContainerMasterInsert> = {};
    if (data.feet_container_size !== undefined) {
      patch.feetContainerSize = data.feet_container_size;
    }
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(feetContainerMaster)
      .set(patch)
      .where(eq(feetContainerMaster.id, id))
      .returning({ id: feetContainerMaster.id });

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
      .update(feetContainerMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(feetContainerMaster.id, id))
      .returning({ id: feetContainerMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
