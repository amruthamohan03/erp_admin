import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentSubtypeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: paymentSubtypeMaster.id,
      payment_type_id: paymentSubtypeMaster.paymentTypeId,
      payment_subtype: paymentSubtypeMaster.paymentSubtype,
      display: paymentSubtypeMaster.display,
      created_at: paymentSubtypeMaster.createdAt,
      updated_at: paymentSubtypeMaster.updatedAt,
      created_by: paymentSubtypeMaster.createdBy,
      updated_by: paymentSubtypeMaster.updatedBy,
    })
    .from(paymentSubtypeMaster)
    .where(eq(paymentSubtypeMaster.display, 'Y'))
    .orderBy(asc(paymentSubtypeMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  payment_type_id: z.coerce.number().int().positive(),
  payment_subtype: z.string().min(1).max(100),
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
      .insert(paymentSubtypeMaster)
      .values({
        paymentTypeId: d.payment_type_id,
        paymentSubtype: d.payment_subtype,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: paymentSubtypeMaster.id,
        payment_type_id: paymentSubtypeMaster.paymentTypeId,
        payment_subtype: paymentSubtypeMaster.paymentSubtype,
        display: paymentSubtypeMaster.display,
        created_at: paymentSubtypeMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'payment subtype');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[payment-subtypes.POST]', err);
    return fail('Server error', 500);
  }
}
