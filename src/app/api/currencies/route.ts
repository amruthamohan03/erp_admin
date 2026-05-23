import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { currencyMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: currencyMaster.id,
      currency_name: currencyMaster.currencyName,
      currency_short_name: currencyMaster.currencyShortName,
      display: currencyMaster.display,
      created_at: currencyMaster.createdAt,
      updated_at: currencyMaster.updatedAt,
      created_by: currencyMaster.createdBy,
      updated_by: currencyMaster.updatedBy,
    })
    .from(currencyMaster)
    .where(eq(currencyMaster.display, 'Y'))
    .orderBy(asc(currencyMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  currency_name: z.string().min(1).max(100),
  currency_short_name: z.string().min(1).max(10),
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
      .insert(currencyMaster)
      .values({
        currencyName: d.currency_name,
        currencyShortName: d.currency_short_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: currencyMaster.id,
        currency_name: currencyMaster.currencyName,
        currency_short_name: currencyMaster.currencyShortName,
        display: currencyMaster.display,
        created_at: currencyMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[currencies.POST]', err);
    return fail('Server error', 500);
  }
}
