import { NextRequest } from 'next/server';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealBatch, sealNumber, mainOfficeMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/seal-numbers/available?location_id=&limit=
// All currently-available seals, optionally scoped to one office. Used by
// the Tracking module's assignment picker — when a clearing operator
// applies seals to a container they pick from this list.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const sp = new URL(req.url).searchParams;
  const conditions: SQL[] = [
    eq(sealNumber.status, 'Available'),
    eq(sealNumber.display, 'Y'),
  ];

  const locationId = sp.get('location_id');
  if (locationId && /^\d+$/.test(locationId) && locationId !== '0') {
    conditions.push(eq(sealBatch.officeLocationId, Number(locationId)));
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
      seal_batch_id: sealNumber.sealBatchId,
      office_location_id: sealBatch.officeLocationId,
      location_name: mainOfficeMaster.mainLocationName,
    })
    .from(sealNumber)
    .innerJoin(sealBatch, eq(sealBatch.id, sealNumber.sealBatchId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealBatch.officeLocationId))
    .where(and(...conditions))
    .orderBy(asc(sealNumber.id))
    .limit(limit);

  return ok({ count: rows.length, seals: rows });
});
