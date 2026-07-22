import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  officeLocationMaster,
  type OfficeLocationMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { officeLocationUpdateSchema } from '@/schemas';

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
        id: officeLocationMaster.id,
        location_name: officeLocationMaster.locationName,
        province_id: officeLocationMaster.provinceId,
        display: officeLocationMaster.display,
        created_at: officeLocationMaster.createdAt,
        updated_at: officeLocationMaster.updatedAt,
      })
      .from(officeLocationMaster)
      .where(eq(officeLocationMaster.id, id))
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

    const data = officeLocationUpdateSchema.parse(await req.json());

    const patch: Partial<OfficeLocationMasterInsert> = {};
    if (data.location_name !== undefined) {
      patch.locationName = data.location_name;
    }
    if (data.province_id !== undefined) patch.provinceId = data.province_id;
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(officeLocationMaster)
      .set(patch)
      .where(eq(officeLocationMaster.id, id))
      .returning({ id: officeLocationMaster.id });

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
      .update(officeLocationMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(officeLocationMaster.id, id))
      .returning({ id: officeLocationMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
