import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankExchangeRate, type BankExchangeRateInsert } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .select({
      id: bankExchangeRate.id,
      bank_id: bankExchangeRate.bankId,
      exchange_date: bankExchangeRate.exchangeDate,
      currency_id: bankExchangeRate.currencyId,
      currency_code: bankExchangeRate.currencyCode,
      bcc_rate: bankExchangeRate.bccRate,
      bank_rate: bankExchangeRate.bankRate,
      created_at: bankExchangeRate.createdAt,
      updated_at: bankExchangeRate.updatedAt,
    })
    .from(bankExchangeRate)
    .where(eq(bankExchangeRate.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const rateString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^-?\d+(\.\d{1,4})?$/.test(v), 'Invalid rate format');

const updateSchema = z.object({
  bank_id: z.number().int().positive().optional(),
  exchange_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency_id: z.number().int().positive().optional(),
  currency_code: z.string().min(1).max(10).optional(),
  bcc_rate: rateString.optional(),
  bank_rate: rateString.optional(),
});

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    const patch: Partial<BankExchangeRateInsert> = {};
    if (d.bank_id !== undefined) patch.bankId = d.bank_id;
    if (d.exchange_date !== undefined) patch.exchangeDate = d.exchange_date;
    if (d.currency_id !== undefined) patch.currencyId = d.currency_id;
    if (d.currency_code !== undefined) patch.currencyCode = d.currency_code;
    if (d.bcc_rate !== undefined) patch.bccRate = d.bcc_rate;
    if (d.bank_rate !== undefined) patch.bankRate = d.bank_rate;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(bankExchangeRate)
      .set(patch)
      .where(eq(bankExchangeRate.id, id))
      .returning({ id: bankExchangeRate.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[bank-exchange-rates.PUT]', err);
    return fail('Server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .delete(bankExchangeRate)
    .where(eq(bankExchangeRate.id, id))
    .returning({ id: bankExchangeRate.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
