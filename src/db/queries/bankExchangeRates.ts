import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db, type Database, type Transaction } from '@/lib/db';
import { bankExchangeRate } from '@/db/schema';

// §2 — the Bank Exchange Rate board's two derived facts, ported from main's
// BankExchangeRateController: which bank quoted highest, and how that compares
// with the last BCC rate published before the day being entered.
//
// The DB-touching half is here; the two pure rules are in
// [exchangeRates.ts](src/lib/exchangeRates.ts) and re-exported below, because
// the board SCREEN needs them too — it repaints Highest and Diff as the operator
// types — and a client component cannot import this module without pulling the
// pg Pool into the bundle. Re-exporting rather than copying keeps "highest wins,
// ties go to the first" stated once (§4.10), and keeps this module the single
// import site every existing caller already uses.
export {
  highestQuote,
  rateDifference,
  round4,
  type HighestQuote,
  type QuotedRate,
} from '@/lib/exchangeRates';

export interface PreviousBcc {
  rate: number;
  date: string | null;
}

/**
 * The BCC rate of the most recent day BEFORE `date` for this currency.
 *
 * Strictly earlier, so re-saving a day compares against the day before it and
 * never against itself. Only rows carrying a real reference count (`bcc_rate > 0`),
 * because a board saved before the reference was known stores zero, and treating
 * that as "the previous BCC was 0" would report a difference the size of the
 * whole rate.
 *
 * Soft-deleted days are skipped (§4.27): a day taken off the board is not a day
 * the BCC was published on.
 */
export async function previousBcc(
  currencyId: number,
  date: string,
  conn: Database | Transaction = db,
): Promise<PreviousBcc> {
  const [row] = await conn
    .select({
      bcc_rate: bankExchangeRate.bccRate,
      exchange_date: bankExchangeRate.exchangeDate,
    })
    .from(bankExchangeRate)
    .where(
      and(
        eq(bankExchangeRate.currencyId, currencyId),
        lt(bankExchangeRate.exchangeDate, date),
        eq(bankExchangeRate.display, 'Y'),
        sql`${bankExchangeRate.bccRate} > 0`,
      ),
    )
    .orderBy(desc(bankExchangeRate.exchangeDate))
    .limit(1);

  if (!row) return { rate: 0, date: null };
  return { rate: Number(row.bcc_rate ?? 0), date: row.exchange_date };
}
