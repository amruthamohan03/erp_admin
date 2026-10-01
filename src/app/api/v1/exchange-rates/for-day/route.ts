import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exchangeRateMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { exchangeRateForDayQuerySchema } from '@/schemas';

// GET /api/v1/exchange-rates/for-day?date=&currency_id=
//
// What the Bank Exchange Rate board asks for when the operator picks a day and
// a currency. Returns the master row for exactly that pair, or nulls.
//
// EXACTLY that pair — no falling back to the nearest earlier day, and no
// taking the only row on file when the currency does not match. A rate shown
// in a box captioned "BCC" would be saved as that day's published figure, and
// afterwards nobody could tell it had been borrowed from another day. That is
// the same reasoning the BCC lookup route already applies to the DGI feed: an
// empty field that says why beats a confident wrong number (§4.23).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = exchangeRateForDayQuerySchema.parse({
    date: searchParams.get('date') ?? undefined,
    currency_id: searchParams.get('currency_id') ?? undefined,
  });

  const [row] = await db
    .select({
      id: exchangeRateMaster.id,
      rate_date: exchangeRateMaster.rateDate,
      currency_id: exchangeRateMaster.currencyId,
      declaration_rate: exchangeRateMaster.declarationRate,
      bcc_rate: exchangeRateMaster.bccRate,
    })
    .from(exchangeRateMaster)
    .where(
      and(
        eq(exchangeRateMaster.rateDate, q.date),
        eq(exchangeRateMaster.currencyId, q.currency_id),
        eq(exchangeRateMaster.display, 'Y'),
      ),
    )
    .limit(1);

  // Not a 404: "no rates filed for this day" is an answer, not a failure, and
  // the board shows a note rather than an error banner.
  return ok(
    row ?? {
      id: null,
      rate_date: q.date,
      currency_id: q.currency_id,
      declaration_rate: null,
      bcc_rate: null,
    },
  );
});
