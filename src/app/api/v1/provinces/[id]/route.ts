import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  provinceMaster,
  originMaster,
  type ProvinceMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { provinceUpdateSchema } from '@/schemas';

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
        id: provinceMaster.id,
        province_name: provinceMaster.provinceName,
        origin_id: provinceMaster.originId,
        origin_name: originMaster.originName,
        display: provinceMaster.display,
        created_at: provinceMaster.createdAt,
        updated_at: provinceMaster.updatedAt,
      })
      .from(provinceMaster)
      .leftJoin(originMaster, eq(originMaster.id, provinceMaster.originId))
      .where(eq(provinceMaster.id, id))
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

    const data = provinceUpdateSchema.parse(await req.json());

    const patch: Partial<ProvinceMasterInsert> = {};
    if (data.province_name !== undefined) {
      patch.provinceName = data.province_name;
    }
    if (data.origin_id !== undefined) patch.originId = data.origin_id;
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(provinceMaster)
      .set(patch)
      .where(eq(provinceMaster.id, id))
      .returning({ id: provinceMaster.id });

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
      .update(provinceMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(provinceMaster.id, id))
      .returning({ id: provinceMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
