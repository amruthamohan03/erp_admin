// GET /api/seal-numbers — the individual seal-number tracker list, with optional
// ?status=, ?location= and ?q= filters. Joins master + office for location/date.
import { NextRequest } from 'next/server';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealIndividualNumbers, sealNos, mainOfficeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { SEAL_STATUSES } from '@/lib/seals/constants';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const sp = new URL(req.url).searchParams;
  const conditions: SQL[] = [eq(sealIndividualNumbers.display, 'Y')];

  const status = sp.get('status');
  if (status && (SEAL_STATUSES as readonly string[]).includes(status)) {
    conditions.push(eq(sealIndividualNumbers.status, status));
  }
  const loc = sp.get('location');
  if (loc && /^\d+$/.test(loc) && loc !== '0') conditions.push(eq(sealNos.officeLocationId, Number(loc)));

  const q = (sp.get('q') ?? '').trim();
  if (q) {
    const like = `%${q}%`;
    const m = or(
      ilike(sealIndividualNumbers.sealNumber, like),
      ilike(sealIndividualNumbers.notes, like),
      ilike(mainOfficeMaster.mainLocationName, like),
    );
    if (m) conditions.push(m);
  }

  const rows = await db
    .select({
      id: sealIndividualNumbers.id,
      seal_number: sealIndividualNumbers.sealNumber,
      status: sealIndividualNumbers.status,
      notes: sealIndividualNumbers.notes,
      location: mainOfficeMaster.mainLocationName,
      location_id: sealNos.officeLocationId,
      seal_master_id: sealIndividualNumbers.sealMasterId,
      purchase_date: sealNos.purchaseDate,
      created_at: sealIndividualNumbers.createdAt,
    })
    .from(sealIndividualNumbers)
    .leftJoin(sealNos, eq(sealNos.id, sealIndividualNumbers.sealMasterId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealNos.officeLocationId))
    .where(and(...conditions))
    .orderBy(desc(sealIndividualNumbers.id));

  return ok(rows);
}
