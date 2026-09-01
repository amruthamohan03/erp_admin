import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clearingBasisMaster, type ClearingBasisMasterInsert } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { clearingBasisUpdateSchema } from '@/schemas';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Invalid id');
  return id;
}

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  const [row] = await db
    .select({
      id: clearingBasisMaster.id,
      clearing_basis_name: clearingBasisMaster.clearingBasisName,
      display: clearingBasisMaster.display,
      created_at: clearingBasisMaster.createdAt,
      updated_at: clearingBasisMaster.updatedAt,
    })
    .from(clearingBasisMaster)
    .where(eq(clearingBasisMaster.id, id))
    .limit(1);

  if (!row) throw new NotFoundError();
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  const data = clearingBasisUpdateSchema.parse(await req.json());

  const patch: Partial<ClearingBasisMasterInsert> = {};
  if (data.clearing_basis_name !== undefined) patch.clearingBasisName = data.clearing_basis_name;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) throw new BadRequestError('Nothing to update');
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  const [row] = await db
    .update(clearingBasisMaster)
    .set(patch)
    .where(eq(clearingBasisMaster.id, id))
    .returning({ id: clearingBasisMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});

// §4.27 — hides the row, never destroys it. Restore and permanent delete live
// in the Recycle Bin behind their own permissions.
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const id = parseId((await params).id);
  const [row] = await db
    .update(clearingBasisMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(clearingBasisMaster.id, id))
    .returning({ id: clearingBasisMaster.id });

  if (!row) throw new NotFoundError();
  return ok({ id: row.id });
});
