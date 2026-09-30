// §4.29 — what a consignment cost, what it was billed for, and the difference.
//
// The arithmetic lives here, pure and tested, because it is the whole point of
// the module and every figure on the screen is derived from it. The SQL in
// db/queries/expenseTracker.ts gathers the inputs; nothing there decides what
// profit means.

/** The money side of one file. All figures are USD (see `other_currency_spend`). */
export interface FileMoney {
  /** Spend on requests that completed the approval chain — money that has left. */
  paid_spend: number;
  /** Approved or in flight, not rejected, not yet paid. Committed, not spent. */
  pending_spend: number;
  /** This file's share of every invoice covering it. */
  invoiced: number;
  /**
   * Requests against this file in a currency other than USD.
   *
   * Counted, never converted. There is no exchange rate that is right for an
   * arbitrary currency on an arbitrary past date, and a made-up one produces a
   * profit figure that looks precise and is wrong. The screen marks the row
   * instead, so an operator knows the number is incomplete rather than false.
   */
  other_currency_spend_count: number;
}

export interface FileProfit extends FileMoney {
  /** invoiced − paid_spend. Negative means the file lost money. */
  profit: number;
  /** Profit as a percentage of what was invoiced; null when nothing was invoiced. */
  margin_pct: number | null;
  /** True when a figure is known to be incomplete, so the UI can say so. */
  incomplete: boolean;
}

/**
 * Tidy a money figure to cents.
 *
 * This exists to clean up FLOAT ARTEFACTS — `5000 - 3200` coming back as
 * 1799.9999999999998 — not to do decimal-exact rounding. The exact arithmetic
 * is Postgres's: every figure here is a SUM over a `numeric` column, so the
 * values arriving are already correct to the cent and this only removes the
 * noise that reading them into a JS number adds.
 *
 * It is NOT safe for the classic half-cent case: `1.005` is stored as
 * 1.00499…, so it rounds to 1.00, not 1.01. That is the honest result for the
 * value actually held, and it cannot arise from a `numeric(15,2)` column, which
 * never carries a third decimal. If a figure ever needs rounding from more than
 * two decimals, round it in SQL where the decimal type is real.
 */
export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Profit for one file.
 *
 * Deliberately measured against PAID spend, not committed: profit is what is
 * left of money received after money that has actually gone out. Pending spend
 * is carried alongside so an operator can see what is still to come, without it
 * moving a figure that should only move when a payment completes.
 */
export function fileProfit(money: FileMoney): FileProfit {
  const paid = round2(money.paid_spend);
  const pending = round2(money.pending_spend);
  const invoiced = round2(money.invoiced);
  const profit = round2(invoiced - paid);

  return {
    paid_spend: paid,
    pending_spend: pending,
    invoiced,
    other_currency_spend_count: money.other_currency_spend_count,
    profit,
    // Against what was INVOICED, which is the revenue this file produced.
    // Dividing by spend instead would answer a different question (return on
    // outlay) and would be undefined for a file that cost nothing.
    margin_pct: invoiced > 0 ? round2((profit / invoiced) * 100) : null,
    // A file with untranslated spend has a profit that is too high by whatever
    // those requests were worth, so it must not be read as a clean figure.
    incomplete: money.other_currency_spend_count > 0,
  };
}

/**
 * One invoice's share for a single file.
 *
 * An invoice covering several files carries ONE total and nothing that says how
 * much of it belongs to each, so it is divided equally. That keeps the sum over
 * all files equal to the real invoiced amount — no revenue is invented and none
 * is lost — which a "count it only where the invoice covers one file" rule
 * would not.
 *
 * The screen shows the file count beside a shared figure so an equal share is
 * never mistaken for a directly billed amount.
 */
export function invoiceShare(invoiceTotal: number, fileCount: number): number {
  if (!Number.isFinite(invoiceTotal) || fileCount <= 0) return 0;
  return round2(invoiceTotal / fileCount);
}

/** Totals across a page of files, for the KPI row. */
export function summarise(rows: readonly FileProfit[]): FileProfit & { files: number } {
  const total = rows.reduce(
    (acc, r) => ({
      paid_spend: acc.paid_spend + r.paid_spend,
      pending_spend: acc.pending_spend + r.pending_spend,
      invoiced: acc.invoiced + r.invoiced,
      other_currency_spend_count:
        acc.other_currency_spend_count + r.other_currency_spend_count,
    }),
    { paid_spend: 0, pending_spend: 0, invoiced: 0, other_currency_spend_count: 0 },
  );
  return { ...fileProfit(total), files: rows.length };
}
