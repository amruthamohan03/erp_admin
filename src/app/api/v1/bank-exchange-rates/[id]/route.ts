import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  bankExchangeRate,
  banklistMaster,
  currencyMaster,
  type BankExchangeRateInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { bankExchangeRateUpdateSchema } from '@/schemas';

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
        id: bankExchangeRate.id,
        bank_id: bankExchangeRate.bankId,
        bank_name: banklistMaster.bankName,
        currency_id: bankExchangeRate.currencyId,
        currency_short_name: currencyMaster.currencyShortName,
        exchange_date: bankExchangeRate.exchangeDate,
        bcc_rate: bankExchangeRate.bccRate,
        bank_rate: bankExchangeRate.bankRate,
        created_at: bankExchangeRate.createdAt,
        updated_at: bankExchangeRate.updatedAt,
      })
      .from(bankExchangeRate)
      .leftJoin(banklistMaster, eq(banklistMaster.id, bankExchangeRate.bankId))
      .leftJoin(
        currencyMaster,
        eq(currencyMaster.id, bankExchangeRate.currencyId),
      )
      .where(eq(bankExchangeRate.id, id))
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

    const data = bankExchangeRateUpdateSchema.parse(await req.json());

    const patch: Partial<BankExchangeRateInsert> = {};
    if (data.bank_id !== undefined) patch.bankId = data.bank_id;
    if (data.currency_id !== undefined) patch.currencyId = data.currency_id;
    if (data.exchange_date !== undefined) {
      patch.exchangeDate = data.exchange_date;
    }
    if (data.bcc_rate !== undefined) patch.bccRate = data.bcc_rate;
    if (data.bank_rate !== undefined) patch.bankRate = data.bank_rate;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(bankExchangeRate)
      .set(patch)
      .where(eq(bankExchangeRate.id, id))
      .returning({ id: bankExchangeRate.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);

// Hard-delete — bank_exchange_rate_t has no display column. Rate
// rows are transactional and removing a duplicate / wrong entry is
// the right semantics; audit history lives in audit_log_t.

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
      .delete(bankExchangeRate)
      .where(eq(bankExchangeRate.id, id))
      .returning({ id: bankExchangeRate.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
