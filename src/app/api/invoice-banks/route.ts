import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoiceBankMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
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
      created_by: invoiceBankMaster.createdBy,
      updated_by: invoiceBankMaster.updatedBy,
    })
    .from(invoiceBankMaster)
    .where(eq(invoiceBankMaster.display, 'Y'))
    .orderBy(asc(invoiceBankMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  invoice_bank_name: z.string().min(1).max(255),
  invoice_bank_account_name: z.string().min(1).max(255),
  invoice_bank_account_number: z.string().min(1).max(50),
  invoice_bank_swift: z.string().max(20).optional().nullable(),
  invoice_bank_address: z.string().optional().nullable(),
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
      .insert(invoiceBankMaster)
      .values({
        invoiceBankName: d.invoice_bank_name,
        invoiceBankAccountName: d.invoice_bank_account_name,
        invoiceBankAccountNumber: d.invoice_bank_account_number,
        invoiceBankSwift: d.invoice_bank_swift ?? null,
        invoiceBankAddress: d.invoice_bank_address ?? null,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: invoiceBankMaster.id,
        invoice_bank_name: invoiceBankMaster.invoiceBankName,
        display: invoiceBankMaster.display,
        created_at: invoiceBankMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[invoice-banks.POST]', err);
    return fail('Server error', 500);
  }
}
