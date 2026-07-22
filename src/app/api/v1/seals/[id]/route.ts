import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealBatch, sealNumber, mainOfficeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { computeTotalSeal } from '@/lib/seals';
import { sealBatchUpdateSchema } from '@/schemas/seals';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [row] = await db
    .select({
      id: sealBatch.id,
      office_location_id: sealBatch.officeLocationId,
      location_name: mainOfficeMaster.mainLocationName,
      sub_office_code: sealBatch.subOfficeCode,
      purchase_date: sealBatch.purchaseDate,
      total_amount: sealBatch.totalAmount,
      total_seal: sealBatch.totalSeal,
      display: sealBatch.display,
      created_at: sealBatch.createdAt,
      updated_at: sealBatch.updatedAt,
    })
    .from(sealBatch)
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealBatch.officeLocationId))
    .where(eq(sealBatch.id, id))
    .limit(1);

  if (!row) throw new NotFoundError('Seal batch not found');
  return ok(row);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const data = sealBatchUpdateSchema.parse(await req.json());

  const patch: Record<string, unknown> = {};
  if (data.office_location_id !== undefined) {
    patch.officeLocationId = data.office_location_id;
  }
  if (data.purchase_date !== undefined) patch.purchaseDate = data.purchase_date;
  if (data.sub_office_code !== undefined) {
    patch.subOfficeCode = data.sub_office_code;
  }
  if (data.total_amount !== undefined) {
    patch.totalAmount = String(data.total_amount);
    patch.totalSeal = computeTotalSeal(data.total_amount);
  }
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP`;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(sealBatch)
      .set(patch)
      .where(eq(sealBatch.id, id))
      .returning({ id: sealBatch.id });
    if (!row) return null;
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'update',
      entityType: 'seal_batch',
      entityId: String(id),
      after: patch,
    });
    return row.id;
  });

  if (!updated) throw new NotFoundError('Seal batch not found');
  return ok({ id: updated });
});

// Soft-delete: flip the batch's display to 'N' and cascade the same to
// every individual seal number. Both updates + the audit row live in one
// transaction so partial state is impossible.

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(sealBatch)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(sealBatch.id, id))
      .returning({ id: sealBatch.id });
    if (!row) return null;

    await tx
      .update(sealNumber)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(sealNumber.sealBatchId, id));

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'delete',
      entityType: 'seal_batch',
      entityId: String(id),
    });
    return row.id;
  });

  if (!deleted) throw new NotFoundError('Seal batch not found');
  return ok({ id: deleted });
});
