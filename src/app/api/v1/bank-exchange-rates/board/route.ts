import { NextRequest } from 'next/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankExchangeRate, banklistMaster, currencyMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import {
  bankExchangeRateBoardDeleteSchema,
  bankExchangeRateBoardQuerySchema,
  bankExchangeRateBoardSaveSchema,
} from '@/schemas';

// GET    /api/v1/bank-exchange-rates/board?date=&currency_id=
// POST   /api/v1/bank-exchange-rates/board
// DELETE /api/v1/bank-exchange-rates/board?exchange_date=&currency_id=
//
// The daily rate board: one date, the BCC reference, and what each exchange bank
// quoted against it. It is ONE record to an operator, so it is read and written
// as one — the alternative (a row per bank) let a board be half-saved, leaving
// today's banks compared against yesterday's reference.
//
// Every bank flagged `for_exchange = 'Y'` comes back whether or not it has a
// rate yet: the board is the list of banks to fill in, not the list already
// filled in, and a bank that vanished from the grid until someone typed into it
// would be a bank nobody remembers to quote.

interface BoardBank {
  bank_id: number;
  bank_name: string | null;
  bank_code: string | null;
  bank_rate: string | null;
  rate_id: number | null;
  updated_at: Date | null;
}


/**
 * Which currency to open the board on when the caller did not say.
 *
 * The most recently quoted one, because that is the board somebody is actually
 * keeping. Falling straight to CDF looked reasonable and was the bug: on a
 * database whose rates are all USD it opened on an empty grid over an empty
 * history, which is indistinguishable from a screen that failed to load.
 * CDF is still the fallback when there is nothing quoted at all.
 */
async function resolveDefaultCurrency(): Promise<number> {
  const [recent] = await db
    .select({ currency_id: bankExchangeRate.currencyId })
    .from(bankExchangeRate)
    .where(eq(bankExchangeRate.display, 'Y'))
    .orderBy(desc(bankExchangeRate.exchangeDate), desc(bankExchangeRate.id))
    .limit(1);
  if (recent) return recent.currency_id;

  const [cdf] = await db
    .select({ id: currencyMaster.id })
    .from(currencyMaster)
    .where(and(eq(currencyMaster.display, 'Y'), eq(currencyMaster.currencyShortName, 'CDF')))
    .limit(1);
  if (cdf) return cdf.id;

  const [first] = await db
    .select({ id: currencyMaster.id })
    .from(currencyMaster)
    .where(eq(currencyMaster.display, 'Y'))
    .orderBy(asc(currencyMaster.id))
    .limit(1);
  return first?.id ?? 1;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = bankExchangeRateBoardQuerySchema.parse({
    date: searchParams.get('date') ?? undefined,
    currency_id: searchParams.get('currency_id') ?? undefined,
  });

  const currencyId = q.currency_id ?? (await resolveDefaultCurrency());

  // LEFT JOIN from the banks, not from the rates — see the note above.
  const banks: BoardBank[] = await db
    .select({
      bank_id: banklistMaster.id,
      bank_name: banklistMaster.bankName,
      bank_code: banklistMaster.bankCode,
      bank_rate: bankExchangeRate.bankRate,
      rate_id: bankExchangeRate.id,
      updated_at: bankExchangeRate.updatedAt,
    })
    .from(banklistMaster)
    .leftJoin(
      bankExchangeRate,
      and(
        eq(bankExchangeRate.bankId, banklistMaster.id),
        eq(bankExchangeRate.exchangeDate, q.date),
        eq(bankExchangeRate.currencyId, currencyId),
        eq(bankExchangeRate.display, 'Y'),
      ),
    )
    .where(and(eq(banklistMaster.forExchange, 'Y'), eq(banklistMaster.display, 'Y')))
    .orderBy(asc(banklistMaster.id));

  // The BCC rate is the day's reference, so it is the same on every row of the
  // board. Reading the first non-empty one keeps a legacy row that only carried
  // it on one bank from showing as blank.
  const [reference] = await db
    .select({ bcc_rate: bankExchangeRate.bccRate })
    .from(bankExchangeRate)
    .where(
      and(
        eq(bankExchangeRate.exchangeDate, q.date),
        eq(bankExchangeRate.currencyId, currencyId),
        eq(bankExchangeRate.display, 'Y'),
        sql`${bankExchangeRate.bccRate} > 0`,
      ),
    )
    .limit(1);

  return ok({
    exchange_date: q.date,
    // The RESOLVED currency, not the requested one — the caller adopts it.
    currency_id: currencyId,
    bcc_rate: reference?.bcc_rate ?? null,
    banks,
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = bankExchangeRateBoardSaveSchema.parse(await req.json());

  const result = await db.transaction(async (tx) => {
    // Only banks that are actually exchange sources, so a stale tab or an
    // API-only caller cannot file a rate against a bank the board never offered.
    const allowed = await tx
      .select({ id: banklistMaster.id, bank_name: banklistMaster.bankName })
      .from(banklistMaster)
      .where(and(eq(banklistMaster.forExchange, 'Y'), eq(banklistMaster.display, 'Y')));
    const allowedById = new Map(allowed.map((b) => [b.id, b.bank_name]));

    const before = await tx
      .select({
        bank_id: bankExchangeRate.bankId,
        bcc_rate: bankExchangeRate.bccRate,
        bank_rate: bankExchangeRate.bankRate,
      })
      .from(bankExchangeRate)
      .where(
        and(
          eq(bankExchangeRate.exchangeDate, data.exchange_date),
          eq(bankExchangeRate.currencyId, data.currency_id),
          eq(bankExchangeRate.display, 'Y'),
        ),
      );
    const beforeById = new Map(before.map((r) => [r.bank_id, r]));

    let created = 0;
    let updated = 0;
    const skipped: number[] = [];

    for (const entry of data.rates) {
      if (!allowedById.has(entry.bank_id)) {
        skipped.push(entry.bank_id);
        continue;
      }

      const values = {
        bccRate: String(data.bcc_rate),
        bankRate: String(entry.bank_rate),
        updatedBy: session.uid,
        updatedAt: new Date(),
      };

      if (beforeById.has(entry.bank_id)) {
        await tx
          .update(bankExchangeRate)
          .set(values)
          .where(
            and(
              eq(bankExchangeRate.bankId, entry.bank_id),
              eq(bankExchangeRate.currencyId, data.currency_id),
              eq(bankExchangeRate.exchangeDate, data.exchange_date),
              eq(bankExchangeRate.display, 'Y'),
            ),
          );
        updated += 1;
      } else {
        await tx.insert(bankExchangeRate).values({
          bankId: entry.bank_id,
          currencyId: data.currency_id,
          exchangeDate: data.exchange_date,
          ...values,
          createdBy: session.uid,
        });
        created += 1;
      }
    }

    // The BCC reference belongs to the DAY, not to a bank. A board saved with
    // three of five banks filled in would otherwise leave the other two carrying
    // yesterday's reference, and the comparison would be against the wrong
    // number on exactly the rows nobody looked at.
    await tx
      .update(bankExchangeRate)
      .set({ bccRate: String(data.bcc_rate), updatedBy: session.uid, updatedAt: new Date() })
      .where(
        and(
          eq(bankExchangeRate.exchangeDate, data.exchange_date),
          eq(bankExchangeRate.currencyId, data.currency_id),
          eq(bankExchangeRate.display, 'Y'),
        ),
      );

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'update',
      entityType: 'bank_exchange_rate_board',
      entityId: `${data.exchange_date}:${data.currency_id}`,
      before: { rates: before },
      after: { bcc_rate: data.bcc_rate, rates: data.rates },
    });

    return { created, updated, skipped };
  });

  return ok(result);
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = bankExchangeRateBoardDeleteSchema.parse({
    exchange_date: searchParams.get('exchange_date') ?? undefined,
    currency_id: searchParams.get('currency_id') ?? undefined,
  });

  const removed = await db.transaction(async (tx) => {
    const before = await tx
      .select({
        id: bankExchangeRate.id,
        bank_id: bankExchangeRate.bankId,
        bcc_rate: bankExchangeRate.bccRate,
        bank_rate: bankExchangeRate.bankRate,
      })
      .from(bankExchangeRate)
      .where(
        and(
          eq(bankExchangeRate.exchangeDate, q.exchange_date),
          eq(bankExchangeRate.currencyId, q.currency_id),
          eq(bankExchangeRate.display, 'Y'),
        ),
      );

    if (before.length === 0) {
      throw new NotFoundError(
        `No rates are recorded for ${q.exchange_date} in this currency, so there is nothing to remove.`,
      );
    }

    // §4.27 — hidden, not destroyed. An invoice whose CDF was converted at this
    // rate must still be able to say what rate it used.
    await tx
      .update(bankExchangeRate)
      .set({ display: 'N', updatedBy: session.uid, updatedAt: new Date() })
      .where(
        and(
          eq(bankExchangeRate.exchangeDate, q.exchange_date),
          eq(bankExchangeRate.currencyId, q.currency_id),
          eq(bankExchangeRate.display, 'Y'),
        ),
      );

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'delete',
      entityType: 'bank_exchange_rate_board',
      entityId: `${q.exchange_date}:${q.currency_id}`,
      before: { rates: before },
    });

    return before.length;
  });

  return ok({ removed });
});
