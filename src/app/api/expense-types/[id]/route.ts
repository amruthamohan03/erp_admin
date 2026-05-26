import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { expenseTypeMaster, type ExpenseTypeMasterInsert } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [row] = await db
    .select({
      id: expenseTypeMaster.id,
      expense_type_name: expenseTypeMaster.expenseTypeName,
      is_import: expenseTypeMaster.isImport,
      is_export: expenseTypeMaster.isExport,
      is_local: expenseTypeMaster.isLocal,
      is_advance: expenseTypeMaster.isAdvance,
      is_other: expenseTypeMaster.isOther,
      display: expenseTypeMaster.display,
      created_at: expenseTypeMaster.createdAt,
      updated_at: expenseTypeMaster.updatedAt,
    })
    .from(expenseTypeMaster)
    .where(eq(expenseTypeMaster.id, id));

  if (!row) return fail('Not found', 404);
  return ok(row);
}

const updateSchema = z.object({
  expense_type_name: z.string().min(1).max(300).optional(),
  is_import: z.boolean().optional(),
  is_export: z.boolean().optional(),
  is_local: z.boolean().optional(),
  is_advance: z.boolean().optional(),
  is_other: z.boolean().optional(),
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

    const patch: Partial<ExpenseTypeMasterInsert> = {};
    if (d.expense_type_name !== undefined) patch.expenseTypeName = d.expense_type_name;
    if (d.is_import !== undefined) patch.isImport = d.is_import;
    if (d.is_export !== undefined) patch.isExport = d.is_export;
    if (d.is_local !== undefined) patch.isLocal = d.is_local;
    if (d.is_advance !== undefined) patch.isAdvance = d.is_advance;
    if (d.is_other !== undefined) patch.isOther = d.is_other;
    if (d.display !== undefined) patch.display = d.display;

    if (Object.keys(patch).length === 0) return fail('Nothing to update', 400);

    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(expenseTypeMaster)
      .set(patch)
      .where(eq(expenseTypeMaster.id, id))
      .returning({ id: expenseTypeMaster.id });

    if (!row) return fail('Not found', 404);
    return ok({ id: row.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'expense type name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[expense-types.PUT]', err);
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
    .update(expenseTypeMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(expenseTypeMaster.id, id))
    .returning({ id: expenseTypeMaster.id });

  if (!row) return fail('Not found', 404);
  return ok({ id: row.id });
}
