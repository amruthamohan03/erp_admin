import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { banklistMaster, type BanklistMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { bankUpdateSchema } from '@/schemas';

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
        id: banklistMaster.id,
        bank_name: banklistMaster.bankName,
        bank_code: banklistMaster.bankCode,
        for_exchange: banklistMaster.forExchange,
        display: banklistMaster.display,
        created_at: banklistMaster.createdAt,
        updated_at: banklistMaster.updatedAt,
      })
      .from(banklistMaster)
      .where(eq(banklistMaster.id, id))
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

    const data = bankUpdateSchema.parse(await req.json());

    const patch: Partial<BanklistMasterInsert> = {};
    if (data.bank_name !== undefined) patch.bankName = data.bank_name;
    if (data.bank_code !== undefined) patch.bankCode = data.bank_code;
    if (data.for_exchange !== undefined) patch.forExchange = data.for_exchange;
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(banklistMaster)
      .set(patch)
      .where(eq(banklistMaster.id, id))
      .returning({ id: banklistMaster.id });

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
      .update(banklistMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(banklistMaster.id, id))
      .returning({ id: banklistMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
