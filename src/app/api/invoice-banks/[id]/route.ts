import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoiceBankMaster, type InvoiceBankMasterInsert } from '@/db/schema';
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
      id: invoiceBankMaster.id,
      invoice_bank_name: invoiceBankMaster.invoiceBankName,
      invoice_bank_account_name: invoiceBankMaster.invoiceBankAccountName,
      invoice_bank_account_number: invoiceBankMaster.invoiceBankAccountNumber,
      invoice_bank_swift: invoiceBankMaster.invoiceBankSwift,
      invoice_bank_address: invoiceBankMaster.invoiceBankAddress,
      display: invoiceBankMaster.display,
      created_at: invoiceBankMaster.createdAt,
      updated_at: invoiceBankMaster.updatedAt,
    })
    .from(invoiceBankMaster)
    .where(eq(invoiceBankMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  invoice_bank_name: z.string().min(1).max(255).optional(),
  invoice_bank_account_name: z.string().min(1).max(255).optional(),
  invoice_bank_account_number: z.string().min(1).max(50).optional(),
  invoice_bank_swift: z.string().max(20).optional().nullable(),
  invoice_bank_address: z.string().optional().nullable(),
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

    const patch: Partial<InvoiceBankMasterInsert> = {};
    if (d.invoice_bank_name !== undefined) patch.invoiceBankName = d.invoice_bank_name;
    if (d.invoice_bank_account_name !== undefined) patch.invoiceBankAccountName = d.invoice_bank_account_name;
    if (d.invoice_bank_account_number !== undefined) patch.invoiceBankAccountNumber = d.invoice_bank_account_number;
    if (d.invoice_bank_swift !== undefined) patch.invoiceBankSwift = d.invoice_bank_swift;
    if (d.invoice_bank_address !== undefined) patch.invoiceBankAddress = d.invoice_bank_address;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(invoiceBankMaster)
      .set(patch)
      .where(eq(invoiceBankMaster.id, id))
      .returning({ id: invoiceBankMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[invoice-banks.PUT]', err);
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
    .update(invoiceBankMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(invoiceBankMaster.id, id))
    .returning({ id: invoiceBankMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
