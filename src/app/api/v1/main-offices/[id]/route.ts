import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mainOfficeMaster, type MainOfficeMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { mainOfficeUpdateSchema } from '@/schemas';

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
        id: mainOfficeMaster.id,
        main_location_name: mainOfficeMaster.mainLocationName,
        display: mainOfficeMaster.display,
        created_at: mainOfficeMaster.createdAt,
        updated_at: mainOfficeMaster.updatedAt,
      })
      .from(mainOfficeMaster)
      .where(eq(mainOfficeMaster.id, id))
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

    const data = mainOfficeUpdateSchema.parse(await req.json());

    const patch: Partial<MainOfficeMasterInsert> = {};
    if (data.main_location_name !== undefined) {
      patch.mainLocationName = data.main_location_name;
    }
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(mainOfficeMaster)
      .set(patch)
      .where(eq(mainOfficeMaster.id, id))
      .returning({ id: mainOfficeMaster.id });

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
      .update(mainOfficeMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(mainOfficeMaster.id, id))
      .returning({ id: mainOfficeMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
