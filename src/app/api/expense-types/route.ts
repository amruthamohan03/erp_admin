import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { expenseTypeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
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
      created_by: expenseTypeMaster.createdBy,
      updated_by: expenseTypeMaster.updatedBy,
    })
    .from(expenseTypeMaster)
    .where(eq(expenseTypeMaster.display, 'Y'))
    .orderBy(asc(expenseTypeMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  expense_type_name: z.string().min(1).max(300),
  is_import: z.boolean().optional(),
  is_export: z.boolean().optional(),
  is_local: z.boolean().optional(),
  is_advance: z.boolean().optional(),
  is_other: z.boolean().optional(),
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
      .insert(expenseTypeMaster)
      .values({
        expenseTypeName: d.expense_type_name,
        isImport: d.is_import ?? false,
        isExport: d.is_export ?? false,
        isLocal: d.is_local ?? false,
        isAdvance: d.is_advance ?? false,
        isOther: d.is_other ?? false,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: expenseTypeMaster.id,
        expense_type_name: expenseTypeMaster.expenseTypeName,
        display: expenseTypeMaster.display,
        created_at: expenseTypeMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'expense type name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[expense-types.POST]', err);
    return fail('Server error', 500);
  }
}
