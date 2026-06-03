import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentTypeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: paymentTypeMaster.id,
      payment_type_name: paymentTypeMaster.paymentTypeName,
      display: paymentTypeMaster.display,
      created_at: paymentTypeMaster.createdAt,
      updated_at: paymentTypeMaster.updatedAt,
      created_by: paymentTypeMaster.createdBy,
      updated_by: paymentTypeMaster.updatedBy,
    })
    .from(paymentTypeMaster)
    .where(eq(paymentTypeMaster.display, 'Y'))
    .orderBy(asc(paymentTypeMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  payment_type_name: z.string().min(1).max(250),
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
      .insert(paymentTypeMaster)
      .values({
        paymentTypeName: d.payment_type_name,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: paymentTypeMaster.id,
        payment_type_name: paymentTypeMaster.paymentTypeName,
        display: paymentTypeMaster.display,
        created_at: paymentTypeMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'payment type name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[payment-types.POST]', err);
    return fail('Server error', 500);
  }
}
