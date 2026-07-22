import { NextRequest } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealBatch, sealNumber, mainOfficeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import {
  sealNumberBulkActionSchema,
  parseSealNumberList,
} from '@/schemas/seals';

// GET /api/v1/seals/{id}/numbers
// List every individual seal under a batch. Joins through main_office_master_t
// so the table can show "where was this seal issued" without an extra hop.

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const batchId = parseInt(idStr, 10);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const rows = await db
    .select({
      id: sealNumber.id,
      seal_number: sealNumber.sealNumber,
      status: sealNumber.status,
      notes: sealNumber.notes,
      location: mainOfficeMaster.mainLocationName,
      created_at: sealNumber.createdAt,
      updated_at: sealNumber.updatedAt,
    })
    .from(sealNumber)
    .leftJoin(sealBatch, eq(sealBatch.id, sealNumber.sealBatchId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealBatch.officeLocationId))
    .where(
      and(
        eq(sealNumber.sealBatchId, batchId),
        eq(sealNumber.display, 'Y'),
      ),
    )
    .orderBy(asc(sealNumber.id));

  return ok(rows);
});

// POST /api/v1/seals/{id}/numbers
// Add individual seal numbers under this batch. Bulk-friendly:
//   - body accepts array OR newline/comma string (paste-from-Excel)
//   - rejects when the addition would exceed the batch's total_seal budget
//   - rejects when any number collides with an existing row (globally unique)
// Audited as one bulk insertion.

export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const batchId = parseInt(idStr, 10);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const data = sealNumberBulkActionSchema.parse(await req.json());
  const list = parseSealNumberList(data.seal_numbers);
  if (list.length === 0) {
    throw new BadRequestError('No valid seal numbers found');
  }

  // Dedupe within the payload to give a clean error before hitting the
  // unique index.
  const seenLocally = new Set<string>();
  const dupesLocal: string[] = [];
  for (const n of list) {
    if (seenLocally.has(n)) dupesLocal.push(n);
    seenLocally.add(n);
  }
  if (dupesLocal.length > 0) {
    throw new BadRequestError(
      `Duplicate seal numbers in payload: ${dupesLocal.join(', ')}`,
    );
  }

  // Confirm the batch exists + load its budget.
  const [batch] = await db
    .select({
      id: sealBatch.id,
      totalSeal: sealBatch.totalSeal,
    })
    .from(sealBatch)
    .where(and(eq(sealBatch.id, batchId), eq(sealBatch.display, 'Y')))
    .limit(1);
  if (!batch) throw new NotFoundError('Seal batch not found');

  // Capacity check.
  const [existing] = await db
    .select({
      count: db.$count(sealNumber, eq(sealNumber.sealBatchId, batchId)),
    })
    .from(sealNumber)
    .where(eq(sealNumber.sealBatchId, batchId))
    .limit(1);
  const currentCount = Number(existing?.count ?? 0);
  if (currentCount + list.length > batch.totalSeal) {
    throw new BadRequestError(
      `Adding ${list.length} would exceed the batch budget of ${batch.totalSeal} ` +
        `(currently ${currentCount} on file)`,
    );
  }

  // Collision check across the whole table — seal_number is globally unique.
  const collisions = await db
    .select({ seal_number: sealNumber.sealNumber })
    .from(sealNumber)
    .where(inArray(sealNumber.sealNumber, list));
  if (collisions.length > 0) {
    throw new ConflictError(
      `Already in use: ${collisions.map((c) => c.seal_number).join(', ')}`,
      { collisions: collisions.map((c) => c.seal_number) },
    );
  }

  const inserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(sealNumber)
      .values(
        list.map((n) => ({
          sealBatchId: batchId,
          sealNumber: n,
          status: 'Available' as const,
          createdBy: session.uid,
          updatedBy: session.uid,
        })),
      )
      .returning({ id: sealNumber.id });
    await recordAudit(tx, {
      actorId: session.uid,
      action: 'create',
      entityType: 'seal_number',
      entityId: 'bulk',
      after: { batch_id: batchId, seal_numbers: list },
      metadata: { op: 'add', count: rows.length },
    });
    return rows.length;
  });

  return ok({ added: inserted, total: list.length }, 201);
});
