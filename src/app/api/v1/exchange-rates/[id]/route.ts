import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exchangeRateMaster, type ExchangeRateMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { exchangeRateUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

function parseId(idStr: string): number {
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Invalid id');
  return id;
}

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const [row] = await db
    .select()
    .from(exchangeRateMaster)
    .where(eq(exchangeRateMaster.id, parseId(idStr)))
    .limit(1);

  if (!row) throw new NotFoundError();
  return ok({
    id: row.id,
    rate_date: row.rateDate,
    currency_id: row.currencyId,
    declaration_rate: row.declarationRate,
    bcc_rate: row.bccRate,
    display: row.display,
  });
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseId(idStr);
  const data = exchangeRateUpdateSchema.parse(await req.json());

  const patch: Partial<ExchangeRateMasterInsert> = {};
  if (data.rate_date !== undefined) patch.rateDate = data.rate_date;
  if (data.currency_id !== undefined) patch.currencyId = data.currency_id;
  // `null` clears a figure; the schema maps '' to null for the same reason.
  if (data.declaration_rate !== undefined) patch.declarationRate = data.declaration_rate;
  if (data.bcc_rate !== undefined) patch.bccRate = data.bcc_rate;
  if (data.display !== undefined) patch.display = data.display;

  if (Object.keys(patch).length === 0) throw new BadRequestError('Nothing to update');
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  let row: { id: number } | undefined;
  try {
    [row] = await db
      .update(exchangeRateMaster)
      .set(patch)
      .where(eq(exchangeRateMaster.id, id))
      .returning({ id: exchangeRateMaster.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'Rates for that date and currency');
    if (dup) return dup;
    throw err;
  }

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  // §4.27 — hidden, never removed. A board saved against this day keeps its own
  // copy of the figures, and the day has to stay explicable afterwards.
  const [row] = await db
    .update(exchangeRateMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(exchangeRateMaster.id, parseId(idStr)))
    .returning({ id: exchangeRateMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
