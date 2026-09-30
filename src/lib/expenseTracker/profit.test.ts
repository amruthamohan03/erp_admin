import { describe, expect, it } from 'vitest';
import { fileProfit, invoiceShare, round2, summarise, type FileMoney } from './profit';

const money = (over: Partial<FileMoney> = {}): FileMoney => ({
  paid_spend: 0,
  pending_spend: 0,
  invoiced: 0,
  other_currency_spend_count: 0,
  ...over,
});

describe('fileProfit', () => {
  it('is what was invoiced less what was actually paid out', () => {
    const r = fileProfit(money({ invoiced: 5000, paid_spend: 3200 }));
    expect(r.profit).toBe(1800);
  });

  it('ignores pending spend, which has not left yet', () => {
    // The distinction the whole module rests on: a request awaiting approval is
    // a commitment, not an expense, and must not move the profit figure.
    const r = fileProfit(money({ invoiced: 5000, paid_spend: 3200, pending_spend: 900 }));
    expect(r.profit).toBe(1800);
    expect(r.pending_spend).toBe(900);
  });

  it('reports a loss as a negative number rather than clamping it', () => {
    const r = fileProfit(money({ invoiced: 1000, paid_spend: 1750 }));
    expect(r.profit).toBe(-750);
    expect(r.margin_pct).toBe(-75);
  });

  it('measures margin against what was invoiced', () => {
    const r = fileProfit(money({ invoiced: 4000, paid_spend: 3000 }));
    expect(r.margin_pct).toBe(25);
  });

  it('has no margin when nothing was invoiced, rather than dividing by zero', () => {
    // A file with spend and no invoice yet — common, and not an error.
    const r = fileProfit(money({ paid_spend: 800 }));
    expect(r.margin_pct).toBeNull();
    expect(r.profit).toBe(-800);
  });

  it('rounds to cents so a column of figures adds up', () => {
    const r = fileProfit(money({ invoiced: 1000 / 3, paid_spend: 100 / 3 }));
    expect(r.invoiced).toBe(333.33);
    expect(r.paid_spend).toBe(33.33);
    expect(r.profit).toBe(300);
  });

  it('marks a file carrying spend in another currency as incomplete', () => {
    // The figure is too HIGH by whatever those requests were worth, so it must
    // not be read as clean — no invented exchange rate (see profit.ts).
    const r = fileProfit(money({ invoiced: 5000, paid_spend: 1000, other_currency_spend_count: 2 }));
    expect(r.incomplete).toBe(true);
    expect(r.profit).toBe(4000);
  });

  it('is complete when every request was in USD', () => {
    expect(fileProfit(money({ invoiced: 10, paid_spend: 1 })).incomplete).toBe(false);
  });

  it('survives a non-finite input instead of producing NaN on screen', () => {
    const r = fileProfit(money({ invoiced: Number.NaN, paid_spend: 50 }));
    expect(r.invoiced).toBe(0);
    expect(r.profit).toBe(-50);
  });
});

describe('invoiceShare', () => {
  it('gives the whole invoice to a file that is its only one', () => {
    expect(invoiceShare(1500, 1)).toBe(1500);
  });

  it('divides equally across the files it covers', () => {
    expect(invoiceShare(900, 3)).toBe(300);
  });

  it('rounds each share to cents', () => {
    expect(invoiceShare(1000, 3)).toBe(333.33);
  });

  it('is zero when the invoice covers no files, rather than dividing by zero', () => {
    expect(invoiceShare(1000, 0)).toBe(0);
    expect(invoiceShare(1000, -1)).toBe(0);
  });

  it('is zero for a non-finite total', () => {
    expect(invoiceShare(Number.NaN, 2)).toBe(0);
  });
});

describe('summarise', () => {
  it('adds the columns and recomputes profit from the totals', () => {
    const rows = [
      fileProfit(money({ invoiced: 1000, paid_spend: 400 })),
      fileProfit(money({ invoiced: 2000, paid_spend: 1100, pending_spend: 50 })),
    ];
    const t = summarise(rows);
    expect(t.files).toBe(2);
    expect(t.invoiced).toBe(3000);
    expect(t.paid_spend).toBe(1500);
    expect(t.pending_spend).toBe(50);
    expect(t.profit).toBe(1500);
    expect(t.margin_pct).toBe(50);
  });

  it('is incomplete when ANY file is', () => {
    const t = summarise([
      fileProfit(money({ invoiced: 100, paid_spend: 10 })),
      fileProfit(money({ invoiced: 100, paid_spend: 10, other_currency_spend_count: 1 })),
    ]);
    expect(t.incomplete).toBe(true);
  });

  it('handles an empty page without dividing by zero', () => {
    const t = summarise([]);
    expect(t.files).toBe(0);
    expect(t.profit).toBe(0);
    expect(t.margin_pct).toBeNull();
  });
});

describe('round2', () => {
  it('removes the float noise a subtraction leaves behind', () => {
    // The job it actually has: 5000 - 3200 comes back as 1799.9999999999998.
    expect(round2(5000 - 3200.0000000000005)).toBe(1800);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it('rounds the value actually held, which at a half-cent goes either way', () => {
    // Whether a "…5" literal rounds up depends on which side of the half its
    // binary representation falls: 1.005 is stored as 1.00499… and goes down,
    // 1.045 as 1.04500…1 and goes up. Both are correct for the value held.
    //
    // Pinned so nobody "fixes" this into a decimal-rounding helper it was never
    // meant to be. It cannot arise here anyway — every figure comes from a
    // numeric(15,2) column, which never carries a third decimal.
    expect(round2(1.005)).toBe(1);
    expect(round2(1.045)).toBe(1.05);
  });

  it('turns a non-finite value into 0 rather than letting NaN spread', () => {
    expect(round2(Number.NaN)).toBe(0);
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
