import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankExchangeRate, banklistMaster, currencyMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp, type XlsxColumn } from '@/lib/xlsx';
import { formatDate } from '@/lib/formatDate';
import { bankExchangeRateHistoryQuerySchema } from '@/schemas';

// GET /api/v1/bank-exchange-rates/export?currency_id=&q=
//
// The rate history as a spreadsheet, in the SAME pivoted shape and the same
// filter as the screen — an export of a filtered list must contain the rows that
// list was showing (§4.15). One column per exchange bank, one row per date.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = bankExchangeRateHistoryQuerySchema.parse({
    currency_id: searchParams.get('currency_id') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    page: '1',
    // The screen pages; a spreadsheet does not. Capped so one click cannot pull
    // an unbounded history into memory.
    pageSize: '100',
  });

  const conds: SQL[] = [
    eq(bankExchangeRate.currencyId, q.currency_id),
    eq(bankExchangeRate.display, 'Y'),
  ];
  const term = q.q?.trim();
  if (term) {
    const like = `%${term}%`;
    conds.push(
      sql`(to_char(${bankExchangeRate.exchangeDate}, 'DD-MM-YYYY') ILIKE ${like}
        OR to_char(${bankExchangeRate.exchangeDate}, 'YYYY-MM-DD') ILIKE ${like})`,
    );
  }
  const where = and(...conds);

  const [banks, currency, rows] = await Promise.all([
    db
      .select({ id: banklistMaster.id, bank_name: banklistMaster.bankName })
      .from(banklistMaster)
      .where(and(eq(banklistMaster.forExchange, 'Y'), eq(banklistMaster.display, 'Y')))
      .orderBy(banklistMaster.id),
    db
      .select({ short: currencyMaster.currencyShortName })
      .from(currencyMaster)
      .where(eq(currencyMaster.id, q.currency_id))
      .limit(1),
    db
      .select({
        exchange_date: sql<string>`to_char(${bankExchangeRate.exchangeDate}, 'YYYY-MM-DD')`,
        bank_id: bankExchangeRate.bankId,
        bcc_rate: bankExchangeRate.bccRate,
        bank_rate: bankExchangeRate.bankRate,
      })
      .from(bankExchangeRate)
      .where(where)
      .orderBy(desc(bankExchangeRate.exchangeDate)),
  ]);

  const currencyName = currency[0]?.short ?? '';

  // Pivot: date → { bcc, per-bank rate }.
  const byDate = new Map<string, { bcc: string | null; rates: Map<number, string | null> }>();
  for (const r of rows) {
    const bucket = byDate.get(r.exchange_date) ?? { bcc: null, rates: new Map() };
    if (!bucket.bcc && r.bcc_rate && Number(r.bcc_rate) > 0) bucket.bcc = r.bcc_rate;
    bucket.rates.set(r.bank_id, r.bank_rate);
    byDate.set(r.exchange_date, bucket);
  }

  const columns: XlsxColumn[] = [
    { key: 'exchange_date', header: 'Date', width: 13 },
    { key: 'currency', header: 'Currency', width: 10 },
    { key: 'bcc_rate', header: 'BCC Rate', width: 12 },
    ...banks.map((b) => ({
      key: `bank_${b.id}`,
      header: (b.bank_name ?? `Bank ${b.id}`).toUpperCase(),
      width: 14,
    })),
    { key: 'best', header: 'Best Rate', width: 14 },
  ];

  const num = (v: string | null | undefined): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const sheetRows = [...byDate.entries()]
    .slice(0, q.pageSize)
    .map(([date, bucket]) => {
      const row: Record<string, unknown> = {
        // §4.19 — a cell somebody reads, so the house format, not the ISO.
        exchange_date: formatDate(date, ''),
        currency: currencyName,
        bcc_rate: num(bucket.bcc),
      };
      let best: { name: string; rate: number } | null = null;
      for (const b of banks) {
        const rate = num(bucket.rates.get(b.id));
        row[`bank_${b.id}`] = rate;
        // Higher is better — more CDF per unit, matching the board's highlight.
        if (rate !== null && (best === null || rate > best.rate)) {
          best = { name: b.bank_name ?? `Bank ${b.id}`, rate };
        }
      }
      row.best = best ? best.name : '';
      return row;
    });

  // §4.28 — exporting is logged like any other consequential action.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'bank_exchange_rate_board',
    entityId: String(q.currency_id),
    after: { rows: sheetRows.length, currency: currencyName, filter: term ?? null },
  });

  const buf = await buildXlsx([
    { name: `Rates ${currencyName}`.trim(), columns, rows: sheetRows },
  ]);
  const res = xlsxResponse(
    buf,
    `bank-exchange-rates-${currencyName || 'all'}-${dateStamp()}.xlsx`,
  );
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});

