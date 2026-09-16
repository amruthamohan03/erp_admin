import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db, type Database, type Transaction } from '@/lib/db';
import { bankExchangeRate } from '@/db/schema';

// §2 — the Bank Exchange Rate board's two derived facts, ported from main's
// BankExchangeRateController: which bank quoted highest, and how that compares
// with the last BCC rate published before the day being entered.
//
// They live here rather than in the board route because the board WRITES them,
// the history grid READS them and the export prints them. Three copies of
// "highest wins, ties go to the first" is three chances to disagree (§4.10).

/** A bank's quote, as the board posts it. */
export interface QuotedRate {
  bank_id: number;
  bank_rate: number;
}

export interface HighestQuote {
  /** 0 when nothing positive was quoted — main's sentinel, kept so the
   *  stored column means the same thing it always did. */
  bank_id: number;
  rate: number;
}

/**
 * The highest quote on a board.
 *
 * Strictly greater, so the FIRST bank to reach the winning number keeps it when
 * two match. That is main's behaviour and it is the stable choice: re-saving an
 * unchanged board must not move the highlight between two banks quoting the
 * same rate.
 *
 * Non-positive quotes are not candidates — a bank left blank is "no quote", not
 * a quote of zero, and zero must never be reported as the day's best rate.
 */
export function highestQuote(rates: readonly QuotedRate[]): HighestQuote {
  let best: HighestQuote = { bank_id: 0, rate: 0 };
  for (const r of rates) {
    const value = Number(r.bank_rate);
    if (Number.isFinite(value) && value > best.rate) {
      best = { bank_id: r.bank_id, rate: value };
    }
  }
  return best;
}

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

/**
 * How far the day's best bank rate sits above the last published BCC.
 *
 * Zero when there is no previous BCC — main's rule, and the right one: with
 * nothing to compare against, "no difference" is the only honest answer, and the
 * screen shows a dash rather than a number in that case.
 */
export function rateDifference(highest: number, previous: number): number {
  if (!(previous > 0)) return 0;
  return round4(highest - previous);
}

/** Money-scale rounding, matching the numeric(10,4) the columns store. */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
