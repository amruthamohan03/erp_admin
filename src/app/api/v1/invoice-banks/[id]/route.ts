import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  invoiceBankMaster,
  type InvoiceBankMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { invoiceBankUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [row] = await db
      .select({
        id: invoiceBankMaster.id,
        invoice_bank_name: invoiceBankMaster.invoiceBankName,
        invoice_bank_account_name: invoiceBankMaster.invoiceBankAccountName,
        invoice_bank_account_number:
          invoiceBankMaster.invoiceBankAccountNumber,
        invoice_bank_swift: invoiceBankMaster.invoiceBankSwift,
        invoice_bank_address: invoiceBankMaster.invoiceBankAddress,
        display: invoiceBankMaster.display,
        created_at: invoiceBankMaster.createdAt,
        updated_at: invoiceBankMaster.updatedAt,
      })
      .from(invoiceBankMaster)
      .where(eq(invoiceBankMaster.id, id))
      .limit(1);

    if (!row) throw new NotFoundError();
    return ok(row);
  },
);

export const PUT = withErrorHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const data = invoiceBankUpdateSchema.parse(await req.json());

    const patch: Partial<InvoiceBankMasterInsert> = {};
    if (data.invoice_bank_name !== undefined) {
      patch.invoiceBankName = data.invoice_bank_name;
    }
    if (data.invoice_bank_account_name !== undefined) {
      patch.invoiceBankAccountName = data.invoice_bank_account_name;
    }
    if (data.invoice_bank_account_number !== undefined) {
      patch.invoiceBankAccountNumber = data.invoice_bank_account_number;
    }
    if (data.invoice_bank_swift !== undefined) {
      patch.invoiceBankSwift = data.invoice_bank_swift;
    }
    if (data.invoice_bank_address !== undefined) {
      patch.invoiceBankAddress = data.invoice_bank_address;
    }
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(invoiceBankMaster)
      .set(patch)
      .where(eq(invoiceBankMaster.id, id))
      .returning({ id: invoiceBankMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);

export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [row] = await db
      .update(invoiceBankMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(invoiceBankMaster.id, id))
      .returning({ id: invoiceBankMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
