import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealBatch, sealNumber, mainOfficeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { sealNumberUpdateSchema } from '@/schemas/seals';

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
      id: sealNumber.id,
      seal_number: sealNumber.sealNumber,
      status: sealNumber.status,
      notes: sealNumber.notes,
      display: sealNumber.display,
      seal_batch_id: sealNumber.sealBatchId,
      office_location_id: sealBatch.officeLocationId,
      location_name: mainOfficeMaster.mainLocationName,
      created_at: sealNumber.createdAt,
      updated_at: sealNumber.updatedAt,
    })
    .from(sealNumber)
    .leftJoin(sealBatch, eq(sealBatch.id, sealNumber.sealBatchId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealBatch.officeLocationId))
    .where(eq(sealNumber.id, id))
    .limit(1);

  if (!row) throw new NotFoundError('Seal number not found');
  return ok(row);
});

// PUT /api/v1/seal-numbers/{id}
// Update status / notes / display on a single seal. For bulk lifecycle
// operations use /seal-numbers/mark-used + /seal-numbers/release instead.

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const data = sealNumberUpdateSchema.parse(await req.json());

  const patch: Record<string, unknown> = {};
  if (data.seal_number !== undefined) patch.sealNumber = data.seal_number;
  if (data.status !== undefined) patch.status = data.status;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.display !== undefined) patch.display = data.display;
  if (Object.keys(patch).length === 0) {
    throw new BadRequestError('Nothing to update');
  }
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP`;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(sealNumber)
      .set(patch)
      .where(eq(sealNumber.id, id))
      .returning({ id: sealNumber.id });
    if (!row) return null;
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'update',
      entityType: 'seal_number',
      entityId: String(id),
      after: patch,
    });
    return row.id;
  });

  if (!updated) throw new NotFoundError('Seal number not found');
  return ok({ id: updated });
});

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
      .update(sealNumber)
      .set({
        display: 'N',
        updatedBy: session.uid,
        updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
      })
      .where(eq(sealNumber.id, id))
      .returning({ id: sealNumber.id });
    if (!row) return null;
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'delete',
      entityType: 'seal_number',
      entityId: String(id),
    });
    return row.id;
  });

  if (!deleted) throw new NotFoundError('Seal number not found');
  return ok({ id: deleted });
});
