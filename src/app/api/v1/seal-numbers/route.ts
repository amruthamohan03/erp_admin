import { NextRequest } from 'next/server';
import { and, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealBatch, sealNumber, mainOfficeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { SEAL_STATUSES, type SealStatusValue } from '@/lib/seals';

// GET /api/v1/seal-numbers?q=&status=&batch_id=&office_id=&limit=
// Cross-batch search for individual seal numbers. Used by the global
// picker UI when assigning seals to a tracking run.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const sp = new URL(req.url).searchParams;
  const conditions: SQL[] = [eq(sealNumber.display, 'Y')];

  const q = sp.get('q')?.trim();
  if (q) conditions.push(ilike(sealNumber.sealNumber, `%${q}%`));

  const status = sp.get('status');
  if (status && (SEAL_STATUSES as readonly string[]).includes(status)) {
    conditions.push(eq(sealNumber.status, status as SealStatusValue));
  }

  const batchId = sp.get('batch_id');
  if (batchId && /^\d+$/.test(batchId)) {
    conditions.push(eq(sealNumber.sealBatchId, Number(batchId)));
  }

  const officeId = sp.get('office_id');
  if (officeId && /^\d+$/.test(officeId)) {
    conditions.push(eq(sealBatch.officeLocationId, Number(officeId)));
  }

  const limit = Math.min(
    1000,
    Math.max(1, parseInt(sp.get('limit') ?? '100', 10) || 100),
  );

  const rows = await db
    .select({
      id: sealNumber.id,
      seal_number: sealNumber.sealNumber,
      status: sealNumber.status,
      notes: sealNumber.notes,
      seal_batch_id: sealNumber.sealBatchId,
      office_location_id: sealBatch.officeLocationId,
      location_name: mainOfficeMaster.mainLocationName,
      purchase_date: sealBatch.purchaseDate,
      created_at: sealNumber.createdAt,
    })
    .from(sealNumber)
    .leftJoin(sealBatch, eq(sealBatch.id, sealNumber.sealBatchId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealBatch.officeLocationId))
    .where(and(...conditions))
    .orderBy(desc(sealNumber.id))
    .limit(limit);

  return ok({ count: rows.length, seals: rows });
});
