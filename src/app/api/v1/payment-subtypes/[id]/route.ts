import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  paymentSubtypeMaster,
  paymentTypeMaster,
  type PaymentSubtypeMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { paymentSubtypeUpdateSchema } from '@/schemas';

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
        id: paymentSubtypeMaster.id,
        payment_subtype: paymentSubtypeMaster.paymentSubtype,
        payment_type_id: paymentSubtypeMaster.paymentTypeId,
        payment_type_name: paymentTypeMaster.paymentTypeName,
        display: paymentSubtypeMaster.display,
        created_at: paymentSubtypeMaster.createdAt,
        updated_at: paymentSubtypeMaster.updatedAt,
      })
      .from(paymentSubtypeMaster)
      .leftJoin(
        paymentTypeMaster,
        eq(paymentTypeMaster.id, paymentSubtypeMaster.paymentTypeId),
      )
      .where(eq(paymentSubtypeMaster.id, id))
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

    const data = paymentSubtypeUpdateSchema.parse(await req.json());

    const patch: Partial<PaymentSubtypeMasterInsert> = {};
    if (data.payment_subtype !== undefined) {
      patch.paymentSubtype = data.payment_subtype;
    }
    if (data.payment_type_id !== undefined) {
      patch.paymentTypeId = data.payment_type_id;
    }
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(paymentSubtypeMaster)
      .set(patch)
      .where(eq(paymentSubtypeMaster.id, id))
      .returning({ id: paymentSubtypeMaster.id });

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
      .update(paymentSubtypeMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(paymentSubtypeMaster.id, id))
      .returning({ id: paymentSubtypeMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
