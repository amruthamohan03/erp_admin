import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hscodeMaster, type HscodeMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { hscodeUpdateSchema } from '@/schemas';

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
        id: hscodeMaster.id,
        hscode_number: hscodeMaster.hscodeNumber,
        hscode_ddi: hscodeMaster.hscodeDdi,
        hscode_ica: hscodeMaster.hscodeIca,
        hscode_dci: hscodeMaster.hscodeDci,
        hscode_dcl: hscodeMaster.hscodeDcl,
        hscode_tpi: hscodeMaster.hscodeTpi,
        display: hscodeMaster.display,
        created_at: hscodeMaster.createdAt,
        updated_at: hscodeMaster.updatedAt,
      })
      .from(hscodeMaster)
      .where(eq(hscodeMaster.id, id))
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

    const data = hscodeUpdateSchema.parse(await req.json());

    const patch: Partial<HscodeMasterInsert> = {};
    if (data.hscode_number !== undefined) {
      patch.hscodeNumber = data.hscode_number;
    }
    if (data.hscode_ddi !== undefined) patch.hscodeDdi = data.hscode_ddi;
    if (data.hscode_ica !== undefined) patch.hscodeIca = data.hscode_ica;
    if (data.hscode_dci !== undefined) patch.hscodeDci = data.hscode_dci;
    if (data.hscode_dcl !== undefined) patch.hscodeDcl = data.hscode_dcl;
    if (data.hscode_tpi !== undefined) patch.hscodeTpi = data.hscode_tpi;
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(hscodeMaster)
      .set(patch)
      .where(eq(hscodeMaster.id, id))
      .returning({ id: hscodeMaster.id });

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
      .update(hscodeMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(hscodeMaster.id, id))
      .returning({ id: hscodeMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
