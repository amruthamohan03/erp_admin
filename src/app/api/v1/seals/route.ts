import { NextRequest } from 'next/server';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealBatch, mainOfficeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { computeTotalSeal } from '@/lib/seals';
import {
  sealBatchCreateSchema,
  sealBatchListQuerySchema,
} from '@/schemas/seals';

// GET /api/v1/seals?office_location_id=&status=
// List active seal batches joined with their office name + a live count
// of added individual seals. The optional `status` filter keeps only
// batches that have at least one individual number in that status.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = sealBatchListQuerySchema.parse({
    office_location_id: searchParams.get('office_location_id') ?? undefined,
    status: searchParams.get('status') ?? undefined,
  });

  const conditions: SQL[] = [eq(sealBatch.display, 'Y')];
  if (q.office_location_id) {
    conditions.push(eq(sealBatch.officeLocationId, q.office_location_id));
  }
  if (q.status) {
    conditions.push(
      sql`${sealBatch.id} IN (
        SELECT seal_batch_id FROM seal_number_t
        WHERE status = ${q.status} AND display = 'Y'
      )`,
    );
  }

  const rows = await db
    .select({
      id: sealBatch.id,
      office_location_id: sealBatch.officeLocationId,
      location_name: mainOfficeMaster.mainLocationName,
      sub_office_code: sealBatch.subOfficeCode,
      purchase_date: sealBatch.purchaseDate,
      total_amount: sealBatch.totalAmount,
      total_seal: sealBatch.totalSeal,
      added_seals: sql<number>`(
        SELECT count(*)::int FROM seal_number_t sn
        WHERE sn.seal_batch_id = ${sealBatch.id} AND sn.display = 'Y'
      )`,
      display: sealBatch.display,
      created_at: sealBatch.createdAt,
      updated_at: sealBatch.updatedAt,
    })
    .from(sealBatch)
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealBatch.officeLocationId))
    .where(and(...conditions))
    .orderBy(desc(sealBatch.id));

  return ok(rows);
});

// POST /api/v1/seals
// Create a batch. total_seal is derived server-side from total_amount;
// the caller doesn't get to set it. Audit row is written inside the same
// transaction so it rolls back with any failure.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const data = sealBatchCreateSchema.parse(await req.json());
  const totalSeal = computeTotalSeal(data.total_amount);

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(sealBatch)
      .values({
        officeLocationId: data.office_location_id,
        purchaseDate: data.purchase_date,
        subOfficeCode: data.sub_office_code ?? null,
        totalAmount: String(data.total_amount),
        totalSeal,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({ id: sealBatch.id });

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'create',
      entityType: 'seal_batch',
      entityId: String(row.id),
      after: {
        office_location_id: data.office_location_id,
        purchase_date: data.purchase_date,
        sub_office_code: data.sub_office_code ?? null,
        total_amount: data.total_amount,
        total_seal: totalSeal,
      },
    });
    return row.id;
  });

  return ok({ id, total_seal: totalSeal }, 201);
});
