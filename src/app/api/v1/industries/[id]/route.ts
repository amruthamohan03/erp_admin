import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { industryMaster, type IndustryMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { industryUpdateSchema } from '@/schemas';

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
        id: industryMaster.id,
        industry_name: industryMaster.industryName,
        display: industryMaster.display,
        created_at: industryMaster.createdAt,
        updated_at: industryMaster.updatedAt,
      })
      .from(industryMaster)
      .where(eq(industryMaster.id, id))
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

    const data = industryUpdateSchema.parse(await req.json());

    const patch: Partial<IndustryMasterInsert> = {};
    if (data.industry_name !== undefined) {
      patch.industryName = data.industry_name;
    }
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(industryMaster)
      .set(patch)
      .where(eq(industryMaster.id, id))
      .returning({ id: industryMaster.id });

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
      .update(industryMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(industryMaster.id, id))
      .returning({ id: industryMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
