import { NextRequest } from 'next/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankExchangeRate, banklistMaster, currencyMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: bankExchangeRate.id,
      bank_id: bankExchangeRate.bankId,
      bank_name: banklistMaster.bankName,
      exchange_date: bankExchangeRate.exchangeDate,
      currency_id: bankExchangeRate.currencyId,
      currency_code: bankExchangeRate.currencyCode,
      currency_name: currencyMaster.currencyName,
      bcc_rate: bankExchangeRate.bccRate,
      bank_rate: bankExchangeRate.bankRate,
      created_at: bankExchangeRate.createdAt,
      updated_at: bankExchangeRate.updatedAt,
      created_by: bankExchangeRate.createdBy,
      updated_by: bankExchangeRate.updatedBy,
    })
    .from(bankExchangeRate)
    .leftJoin(banklistMaster, eq(bankExchangeRate.bankId, banklistMaster.id))
    .leftJoin(currencyMaster, eq(bankExchangeRate.currencyId, currencyMaster.id))
    .orderBy(desc(bankExchangeRate.exchangeDate), desc(bankExchangeRate.id));

  return ok(rows);
}

const rateString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^-?\d+(\.\d{1,4})?$/.test(v), 'Invalid rate format');

const createSchema = z.object({
  bank_id: z.number().int().positive(),
  exchange_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  currency_id: z.number().int().positive(),
  currency_code: z.string().min(1).max(10),
  bcc_rate: rateString.optional(),
  bank_rate: rateString.optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    const [row] = await db
      .insert(bankExchangeRate)
      .values({
        bankId: d.bank_id,
        exchangeDate: d.exchange_date,
        currencyId: d.currency_id,
        currencyCode: d.currency_code,
        bccRate: d.bcc_rate ?? '0.0000',
        bankRate: d.bank_rate ?? '0.0000',
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: bankExchangeRate.id,
        bank_id: bankExchangeRate.bankId,
        exchange_date: bankExchangeRate.exchangeDate,
        currency_id: bankExchangeRate.currencyId,
        currency_code: bankExchangeRate.currencyCode,
        bcc_rate: bankExchangeRate.bccRate,
        bank_rate: bankExchangeRate.bankRate,
        created_at: bankExchangeRate.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[bank-exchange-rates.POST]', err);
    return fail('Server error', 500);
  }
}
