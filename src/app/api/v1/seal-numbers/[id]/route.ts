import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealBatch, sealNumber, mainOfficeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import {
  assertSealsReleasable,
  describeHolder,
  detachSealsFromExports,
  findSealHolders,
} from '@/db/queries/sealUsage';
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

  const [current] = await db
    .select({ sealNumber: sealNumber.sealNumber, status: sealNumber.status })
    .from(sealNumber)
    .where(eq(sealNumber.id, id))
    .limit(1);
  if (!current) throw new NotFoundError('Seal number not found');

  // §4.37 — this route can free a seal too, and used to do it with no check at
  // all: setting `status` to Available (or hiding the row) while an export still
  // named the seal left the same physical seal issuable to a second consignment.
  // The bulk Release screen was guarded and this one was not, which is the same
  // bug arriving through another door.
  // Narrowly: becoming AVAILABLE is what makes a seal issuable again, and that
  // is the transition that can put one physical seal on two consignments.
  // Used → Damaged is deliberately NOT guarded — a damaged seal can never be
  // handed out (mark-used only picks up Available), and recording that a seal
  // was found broken must not force it off the file it was actually applied to.
  // Any transition INTO Available, not just from Used: a seal recorded as
  // Damaged can still be named by an export, and flipping that one straight to
  // Available would hand it out again with the file unchanged.
  const frees = current.status !== 'Available' && data.status === 'Available';
  const holders = frees
    ? await assertSealsReleasable([current.sealNumber], { confirmed: data.detach }, db)
    : [];

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
    // Detach first: if that fails the seal has not been freed either, which is
    // the safe direction (§4.37).
    if (holders.length > 0) {
      await detachSealsFromExports(holders, session.uid, tx);
    }

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
      metadata:
        holders.length > 0
          ? { detached_from: holders.map((h) => h.mca_ref ?? `export #${h.export_id}`) }
          : undefined,
    });
    return row.id;
  });

  if (!updated) throw new NotFoundError('Seal number not found');
  return ok({ id: updated, detached: holders.length });
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  // §4.27 — a soft delete must not silently orphan what references the row.
  // Refused rather than offered a detach: deleting a seal is not the same
  // decision as releasing one, and the operator should take it off the file
  // deliberately first. The message names the file so they know where to go.
  const [current] = await db
    .select({ sealNumber: sealNumber.sealNumber })
    .from(sealNumber)
    .where(eq(sealNumber.id, id))
    .limit(1);
  if (!current) throw new NotFoundError('Seal number not found');
  const holders = await findSealHolders([current.sealNumber], db);
  if (holders.length > 0) {
    throw new ConflictError(
      `Seal ${current.sealNumber} is still on ${holders.map(describeHolder).join('; ')}. ` +
        'Release it from there first, then delete it.',
      { holders },
    );
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
