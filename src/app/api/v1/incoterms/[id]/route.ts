import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { incotermMaster, type IncotermMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { incotermUpdateSchema } from '@/schemas';

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
        id: incotermMaster.id,
        incoterm_short_name: incotermMaster.incotermShortName,
        incoterm_full_name: incotermMaster.incotermFullName,
        display: incotermMaster.display,
        created_at: incotermMaster.createdAt,
        updated_at: incotermMaster.updatedAt,
      })
      .from(incotermMaster)
      .where(eq(incotermMaster.id, id))
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

    const data = incotermUpdateSchema.parse(await req.json());

    const patch: Partial<IncotermMasterInsert> = {};
    if (data.incoterm_short_name !== undefined) {
      patch.incotermShortName = data.incoterm_short_name;
    }
    if (data.incoterm_full_name !== undefined) {
      patch.incotermFullName = data.incoterm_full_name;
    }
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(incotermMaster)
      .set(patch)
      .where(eq(incotermMaster.id, id))
      .returning({ id: incotermMaster.id });

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
      .update(incotermMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(incotermMaster.id, id))
      .returning({ id: incotermMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
