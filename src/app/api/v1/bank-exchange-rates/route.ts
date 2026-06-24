import { NextRequest } from 'next/server';
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  bankExchangeRate,
  banklistMaster,
  currencyMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  bankExchangeRateCreateSchema,
  bankExchangeRateListQuerySchema,
} from '@/schemas';

// GET /api/v1/bank-exchange-rates?bank_id=&currency_id=&from=&to=
//
// Joins bank + currency for display. Ordered by exchange_date desc
// so the most recent rates surface first — the operator typically
// wants today/yesterday at the top of the list.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = bankExchangeRateListQuerySchema.parse({
    bank_id: searchParams.get('bank_id') ?? undefined,
    currency_id: searchParams.get('currency_id') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [];
  if (q.bank_id) conds.push(eq(bankExchangeRate.bankId, q.bank_id));
  if (q.currency_id)
    conds.push(eq(bankExchangeRate.currencyId, q.currency_id));
  if (q.from) conds.push(gte(bankExchangeRate.exchangeDate, q.from));
  if (q.to) conds.push(lte(bankExchangeRate.exchangeDate, q.to));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [countRow] = await db
    .select({ total: count() })
    .from(bankExchangeRate)
    .where(where);

  const items = await db
    .select({
      id: bankExchangeRate.id,
      bank_id: bankExchangeRate.bankId,
      bank_name: banklistMaster.bankName,
      bank_code: banklistMaster.bankCode,
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
    .leftJoin(currencyMaster, eq(currencyMaster.id, bankExchangeRate.currencyId))
    .where(where)
    .orderBy(desc(bankExchangeRate.exchangeDate), desc(bankExchangeRate.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = bankExchangeRateCreateSchema.parse(await req.json());

  const [row] = await db
    .insert(bankExchangeRate)
    .values({
      bankId: data.bank_id,
      currencyId: data.currency_id,
      exchangeDate: data.exchange_date,
      bccRate: data.bcc_rate ?? '0.0000',
      bankRate: data.bank_rate ?? '0.0000',
      createdBy: session.uid,
      updatedBy: session.uid,
    })
    .returning({
      id: bankExchangeRate.id,
      bank_id: bankExchangeRate.bankId,
      currency_id: bankExchangeRate.currencyId,
      exchange_date: bankExchangeRate.exchangeDate,
      bcc_rate: bankExchangeRate.bccRate,
      bank_rate: bankExchangeRate.bankRate,
      created_at: bankExchangeRate.createdAt,
    });

  return ok(row, 201);
});
