import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  expenseTypeMaster,
  type ExpenseTypeMasterInsert,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { expenseTypeUpdateSchema } from '@/schemas';

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
      .where(eq(expenseTypeMaster.id, id))
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

    const data = expenseTypeUpdateSchema.parse(await req.json());

    const patch: Partial<ExpenseTypeMasterInsert> = {};
    if (data.expense_type_name !== undefined) {
      patch.expenseTypeName = data.expense_type_name;
    }
    if (data.is_import !== undefined) patch.isImport = data.is_import;
    if (data.is_export !== undefined) patch.isExport = data.is_export;
    if (data.is_local !== undefined) patch.isLocal = data.is_local;
    if (data.is_advance !== undefined) patch.isAdvance = data.is_advance;
    if (data.is_other !== undefined) patch.isOther = data.is_other;
    if (data.display !== undefined) patch.display = data.display;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestError('Nothing to update');
    }
    patch.updatedBy = session.uid;
    patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

    const [row] = await db
      .update(expenseTypeMaster)
      .set(patch)
      .where(eq(expenseTypeMaster.id, id))
      .returning({ id: expenseTypeMaster.id });

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
      .update(expenseTypeMaster)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(expenseTypeMaster.id, id))
      .returning({ id: expenseTypeMaster.id });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  },
);
