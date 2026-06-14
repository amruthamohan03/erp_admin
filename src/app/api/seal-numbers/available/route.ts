// GET /api/seal-numbers/available?location_id=&limit= — available seals, optionally
// scoped to an office location. For assignment pickers in import/export tracking.
import { NextRequest } from 'next/server';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealIndividualNumbers, sealNos, mainOfficeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const sp = new URL(req.url).searchParams;
  const conditions: SQL[] = [eq(sealIndividualNumbers.status, 'Available'), eq(sealIndividualNumbers.display, 'Y')];
  const loc = sp.get('location_id');
  if (loc && /^\d+$/.test(loc) && loc !== '0') conditions.push(eq(sealNos.officeLocationId, Number(loc)));
  const limit = Math.min(1000, Math.max(1, parseInt(sp.get('limit') ?? '100', 10) || 100));

  const rows = await db
    .select({
      id: sealIndividualNumbers.id,
      seal_number: sealIndividualNumbers.sealNumber,
      status: sealIndividualNumbers.status,
      office_location_id: sealNos.officeLocationId,
      main_location_name: mainOfficeMaster.mainLocationName,
    })
    .from(sealIndividualNumbers)
    .innerJoin(sealNos, eq(sealNos.id, sealIndividualNumbers.sealMasterId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealNos.officeLocationId))
    .where(and(...conditions))
    .orderBy(asc(sealIndividualNumbers.id))
    .limit(limit);

  return ok({ count: rows.length, seals: rows });
}
