import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exchangeRateMaster, currencyMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import { exchangeRateCreateSchema, exchangeRateListQuerySchema } from '@/schemas';

// The day's reference rates — Declaration and BCC (§4.1).

const DUP = 'Rates for that date and currency';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = exchangeRateListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    currency_id: searchParams.get('currency_id') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds = [eq(exchangeRateMaster.display, 'Y')];
  if (q.currency_id) conds.push(eq(exchangeRateMaster.currencyId, q.currency_id));
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    // §4.19 — the column shows DD-MM-YYYY, so a search for what is on screen
    // has to reach the date as well as the currency code.
    const typed = or(
      ilike(currencyMaster.currencyShortName, like),
      sql`to_char(${exchangeRateMaster.rateDate}, 'DD-MM-YYYY') ILIKE ${like}`,
      sql`${exchangeRateMaster.rateDate}::text ILIKE ${like}`,
    );
    if (typed) conds.push(typed);
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(exchangeRateMaster)
    .leftJoin(currencyMaster, eq(currencyMaster.id, exchangeRateMaster.currencyId))
    .where(where);

  const items = await db
    .select({
      id: exchangeRateMaster.id,
      rate_date: exchangeRateMaster.rateDate,
      currency_id: exchangeRateMaster.currencyId,
      currency_name: currencyMaster.currencyShortName,
      declaration_rate: exchangeRateMaster.declarationRate,
      bcc_rate: exchangeRateMaster.bccRate,
      display: exchangeRateMaster.display,
      updated_at: exchangeRateMaster.updatedAt,
    })
    .from(exchangeRateMaster)
    .leftJoin(currencyMaster, eq(currencyMaster.id, exchangeRateMaster.currencyId))
    .where(where)
    // Newest day first — a rate board is read forward from today, unlike a
    // catalogue, which is looked up.
    .orderBy(desc(exchangeRateMaster.rateDate), desc(exchangeRateMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, { meta: { total: countRow.total, page: q.page, pageSize: q.pageSize } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = exchangeRateCreateSchema.parse(await req.json());
  try {
    const [row] = await db
      .insert(exchangeRateMaster)
      .values({
        rateDate: data.rate_date,
        currencyId: data.currency_id,
        declarationRate: data.declaration_rate,
        bccRate: data.bcc_rate,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({ id: exchangeRateMaster.id });
    return ok(row, 201);
  } catch (err) {
    // One live row per day per currency — name the clash rather than surfacing
    // an index name (§4.23).
    const dup = uniqueViolationResponse(err, DUP);
    if (dup) return dup;
    throw err;
  }
});
