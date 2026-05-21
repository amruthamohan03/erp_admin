import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { banklistMaster, type BanklistMasterInsert } from '@/db/schema';
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
      id: banklistMaster.id,
      bank_name: banklistMaster.bankName,
      bank_code: banklistMaster.bankCode,
      for_exchange: banklistMaster.forExchange,
      display: banklistMaster.display,
      created_at: banklistMaster.createdAt,
      updated_at: banklistMaster.updatedAt,
    })
    .from(banklistMaster)
    .where(eq(banklistMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  bank_name: z.string().min(1).max(200).optional(),
  bank_code: z.string().min(1).max(20).optional(),
  for_exchange: z.enum(['Y', 'N']).optional(),
  display: z.enum(['Y', 'N']).optional(),
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

    const patch: Partial<BanklistMasterInsert> = {};
    if (d.bank_name !== undefined) patch.bankName = d.bank_name;
    if (d.bank_code !== undefined) patch.bankCode = d.bank_code;
    if (d.for_exchange !== undefined) patch.forExchange = d.for_exchange;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(banklistMaster)
      .set(patch)
      .where(eq(banklistMaster.id, id))
      .returning({ id: banklistMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[banks.PUT]', err);
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
    .update(banklistMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(banklistMaster.id, id))
    .returning({ id: banklistMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
