import { NextRequest } from 'next/server';
import { and, count, countDistinct, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankExchangeRate, banklistMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { bankExchangeRateHistoryQuerySchema } from '@/schemas';

// GET /api/v1/bank-exchange-rates/history?currency_id=&q=&page=&pageSize=
//
// The board's history, pivoted: one row per DATE with a rate per bank, which is
// how the operator compares — down a bank's column over time, and across a day.
// The flat one-row-per-(bank, date) shape the list endpoint returns cannot be
// read that way; five banks made every day five rows.
//
// Paged over DATES, not over rate rows. Paging the rows would cut a day in half
// across a page boundary and show the same date twice with different banks
// filled in.

interface HistoryRow {
  exchange_date: string;
  bcc_rate: string | null;
  updated_at: Date | null;
  rates: Record<number, string | null>;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = bankExchangeRateHistoryQuerySchema.parse({
    currency_id: searchParams.get('currency_id') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [
    eq(bankExchangeRate.currencyId, q.currency_id),
    eq(bankExchangeRate.display, 'Y'),
  ];

  // Search accepts the DD-MM-YYYY the Date column displays as well as the stored
  // ISO — an operator must be able to type what is on screen (§4.19, §4.15).
  const term = q.q?.trim();
  if (term) {
    const like = `%${term}%`;
    conds.push(
      sql`(to_char(${bankExchangeRate.exchangeDate}, 'DD-MM-YYYY') ILIKE ${like}
        OR to_char(${bankExchangeRate.exchangeDate}, 'YYYY-MM-DD') ILIKE ${like})`,
    );
  }
  const where = and(...conds);

  const [totalRow] = await db
    .select({ total: countDistinct(bankExchangeRate.exchangeDate) })
    .from(bankExchangeRate)
    .where(where);

  // One page of dates first, then the rates on those dates. Two small queries
  // beat one that has to be de-duplicated in JS after over-fetching.
  const dates = await db
    .select({
      exchange_date: sql<string>`to_char(${bankExchangeRate.exchangeDate}, 'YYYY-MM-DD')`,
      // The reference is per day, so max() picks it up wherever it was stored.
      bcc_rate: sql<string | null>`max(${bankExchangeRate.bccRate})`,
      updated_at: sql<Date | null>`max(${bankExchangeRate.updatedAt})`,
      banks_quoted: count(),
    })
    .from(bankExchangeRate)
    .where(where)
    .groupBy(bankExchangeRate.exchangeDate)
    .orderBy(desc(bankExchangeRate.exchangeDate))
    .limit(q.pageSize)
    .offset(offset);

  const items: HistoryRow[] = [];
  if (dates.length > 0) {
    const rows = await db
      .select({
        exchange_date: sql<string>`to_char(${bankExchangeRate.exchangeDate}, 'YYYY-MM-DD')`,
        bank_id: bankExchangeRate.bankId,
        bank_rate: bankExchangeRate.bankRate,
      })
      .from(bankExchangeRate)
      .where(
        and(
          where,
          sql`${bankExchangeRate.exchangeDate} IN (${sql.join(
            dates.map((d) => sql`${d.exchange_date}::date`),
            sql`, `,
          )})`,
        ),
      );

    const byDate = new Map<string, Record<number, string | null>>();
    for (const r of rows) {
      const bucket = byDate.get(r.exchange_date) ?? {};
      bucket[r.bank_id] = r.bank_rate;
      byDate.set(r.exchange_date, bucket);
    }

    for (const d of dates) {
      items.push({
        exchange_date: d.exchange_date,
        bcc_rate: d.bcc_rate,
        updated_at: d.updated_at,
        rates: byDate.get(d.exchange_date) ?? {},
      });
    }
  }

  // The columns travel with the rows: the grid is as wide as the exchange-bank
  // list, and a page that fetched the two separately could render a header for a
  // bank the rows know nothing about.
  const banks = await db
    .select({
      id: banklistMaster.id,
      bank_name: banklistMaster.bankName,
      bank_code: banklistMaster.bankCode,
    })
    .from(banklistMaster)
    .where(and(eq(banklistMaster.forExchange, 'Y'), eq(banklistMaster.display, 'Y')))
    .orderBy(banklistMaster.id);

  return ok(
    { banks, items },
    { meta: { total: totalRow.total, page: q.page, pageSize: q.pageSize } },
  );
});
