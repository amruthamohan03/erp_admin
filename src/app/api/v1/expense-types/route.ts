import { NextRequest } from 'next/server';
import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { expenseTypeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  expenseTypeCreateSchema,
  expenseTypeListQuerySchema,
  type ExpenseTypeFlag,
} from '@/schemas';

// Map the schema's `flag` query value to its Drizzle column. Done
// here (not as data on the table) so a typo in the picker can't
// quietly match the wrong column.
const FLAG_COLUMNS = {
  is_import: expenseTypeMaster.isImport,
  is_export: expenseTypeMaster.isExport,
  is_local: expenseTypeMaster.isLocal,
  is_advance: expenseTypeMaster.isAdvance,
  is_other: expenseTypeMaster.isOther,
} as const satisfies Record<ExpenseTypeFlag, unknown>;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = expenseTypeListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    flag: searchParams.get('flag') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(expenseTypeMaster.display, 'Y')];
  if (q.q?.trim()) {
    conds.push(
      ilike(expenseTypeMaster.expenseTypeName, `%${q.q.trim()}%`),
    );
  }
  if (q.flag) conds.push(eq(FLAG_COLUMNS[q.flag], true));
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(expenseTypeMaster)
    .where(where);

  const items = await db
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
    .where(where)
    .orderBy(desc(expenseTypeMaster.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = expenseTypeCreateSchema.parse(await req.json());
  const [row] = await db
    .insert(expenseTypeMaster)
    .values({
      expenseTypeName: data.expense_type_name,
      isImport: data.is_import ?? false,
      isExport: data.is_export ?? false,
      isLocal: data.is_local ?? false,
      isAdvance: data.is_advance ?? false,
      isOther: data.is_other ?? false,
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
});
