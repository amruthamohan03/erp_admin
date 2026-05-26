import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { banklistMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: banklistMaster.id,
      bank_name: banklistMaster.bankName,
      bank_code: banklistMaster.bankCode,
      for_exchange: banklistMaster.forExchange,
      display: banklistMaster.display,
      created_at: banklistMaster.createdAt,
      updated_at: banklistMaster.updatedAt,
      created_by: banklistMaster.createdBy,
      updated_by: banklistMaster.updatedBy,
    })
    .from(banklistMaster)
    .where(eq(banklistMaster.display, 'Y'))
    .orderBy(asc(banklistMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  bank_name: z.string().min(1).max(200),
  bank_code: z.string().min(1).max(20),
  for_exchange: z.enum(['Y', 'N']).default('N'),
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
      .insert(banklistMaster)
      .values({
        bankName: d.bank_name,
        bankCode: d.bank_code,
        forExchange: d.for_exchange,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: banklistMaster.id,
        bank_name: banklistMaster.bankName,
        bank_code: banklistMaster.bankCode,
        for_exchange: banklistMaster.forExchange,
        display: banklistMaster.display,
        created_at: banklistMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'bank name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[banks.POST]', err);
    return fail('Server error', 500);
  }
}
