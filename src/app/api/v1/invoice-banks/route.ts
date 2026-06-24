import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoiceBankMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  invoiceBankCreateSchema,
  invoiceBankListQuerySchema,
} from '@/schemas';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = invoiceBankListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(invoiceBankMaster.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(invoiceBankMaster.invoiceBankName, like),
      ilike(invoiceBankMaster.invoiceBankAccountName, like),
      ilike(invoiceBankMaster.invoiceBankAccountNumber, like),
    );
    if (orClause) conds.push(orClause);
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(invoiceBankMaster)
    .where(where);

  const items = await db
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
    .where(where)
    .orderBy(desc(invoiceBankMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = invoiceBankCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(invoiceBankMaster)
    .values({
      invoiceBankName: data.invoice_bank_name,
      invoiceBankAccountName: data.invoice_bank_account_name,
      invoiceBankAccountNumber: data.invoice_bank_account_number,
      invoiceBankSwift: data.invoice_bank_swift ?? null,
      invoiceBankAddress: data.invoice_bank_address ?? null,
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
});
