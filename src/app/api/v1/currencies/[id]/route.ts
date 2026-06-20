import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { currencyMaster, type CurrencyMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { currencyUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [row] = await db
    .select({
      id: currencyMaster.id,
      currency_name: currencyMaster.currencyName,
      currency_short_name: currencyMaster.currencyShortName,
      display: currencyMaster.display,
      created_at: currencyMaster.createdAt,
      updated_at: currencyMaster.updatedAt,
    })
    .from(currencyMaster)
    .where(eq(currencyMaster.id, id))
    .limit(1);

  if (!row) throw new NotFoundError();
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const data = currencyUpdateSchema.parse(await req.json());

  const patch: Partial<CurrencyMasterInsert> = {};
  if (data.currency_name !== undefined) patch.currencyName = data.currency_name;
  if (data.currency_short_name !== undefined)
    patch.currencyShortName = data.currency_short_name;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  const [row] = await db
    .update(currencyMaster)
    .set(patch)
    .where(eq(currencyMaster.id, id))
    .returning({ id: currencyMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [row] = await db
    .update(currencyMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(currencyMaster.id, id))
    .returning({ id: currencyMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
