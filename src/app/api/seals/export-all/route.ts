// GET /api/seals/export-all → multi-sheet Excel: Summary, By Location, Seal Masters,
// and all Seal Numbers. Counts are computed from the live data.
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealNos, sealIndividualNumbers, mainOfficeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const counts = (col: string) =>
    sql<number>`cast((select count(*) from seal_individual_numbers_t sin where sin.seal_master_id = ${sealNos.id} and sin.display = 'Y'${col ? sql` and sin.status = ${col}` : sql``}) as int)`;

  const masters = await db
    .select({
      id: sealNos.id,
      location: mainOfficeMaster.mainLocationName,
      sub_office_code: sealNos.subOfficeCode,
      purchase_date: sealNos.purchaseDate,
      total_amount: sealNos.totalAmount,
      total_seal: sealNos.totalSeal,
      added: counts(''),
      available: counts('Available'),
      used: counts('Used'),
      damaged: counts('Damaged'),
    })
    .from(sealNos)
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealNos.officeLocationId))
    .where(eq(sealNos.display, 'Y'))
    .orderBy(asc(mainOfficeMaster.mainLocationName), desc(sealNos.purchaseDate));

  const numbers = await db
    .select({
      id: sealIndividualNumbers.id,
      seal_number: sealIndividualNumbers.sealNumber,
      status: sealIndividualNumbers.status,
      location: mainOfficeMaster.mainLocationName,
      purchase_date: sealNos.purchaseDate,
      notes: sealIndividualNumbers.notes,
    })
    .from(sealIndividualNumbers)
    .innerJoin(sealNos, eq(sealNos.id, sealIndividualNumbers.sealMasterId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealNos.officeLocationId))
    .where(and(eq(sealIndividualNumbers.display, 'Y'), eq(sealNos.display, 'Y')))
    .orderBy(asc(mainOfficeMaster.mainLocationName), asc(sealIndividualNumbers.id));

  // Aggregate.
  const totalSeal = masters.reduce((a, m) => a + (m.total_seal ?? 0), 0);
  const added = masters.reduce((a, m) => a + m.added, 0);
  const available = masters.reduce((a, m) => a + m.available, 0);
  const used = masters.reduce((a, m) => a + m.used, 0);
  const damaged = masters.reduce((a, m) => a + m.damaged, 0);

  const byLoc = new Map<string, { location: string; purchases: number; added: number; available: number; used: number; damaged: number }>();
  for (const m of masters) {
    const key = m.location ?? 'No Location';
    const e = byLoc.get(key) ?? { location: key, purchases: 0, added: 0, available: 0, used: 0, damaged: 0 };
    e.purchases += 1; e.added += m.added; e.available += m.available; e.used += m.used; e.damaged += m.damaged;
    byLoc.set(key, e);
  }

  const buf = await buildXlsx([
    {
      name: 'Summary',
      columns: [{ key: 'metric', header: 'Metric', width: 24 }, { key: 'value', header: 'Value', width: 18 }],
      rows: [
        { metric: 'Locations', value: byLoc.size },
        { metric: 'Purchases', value: masters.length },
        { metric: 'Total Seal', value: totalSeal },
        { metric: 'Added', value: added },
        { metric: 'Available', value: available },
        { metric: 'Used', value: used },
        { metric: 'Damaged', value: damaged },
      ],
    },
    {
      name: 'By Location',
      columns: [
        { key: 'location', header: 'Location', width: 22 },
        { key: 'purchases', header: 'Purchases', width: 12 },
        { key: 'added', header: 'Added', width: 10 },
        { key: 'available', header: 'Available', width: 12 },
        { key: 'used', header: 'Used', width: 10 },
        { key: 'damaged', header: 'Damaged', width: 12 },
      ],
      rows: [...byLoc.values()],
    },
    {
      name: 'Seal Masters',
      columns: [
        { key: 'id', header: 'ID', width: 8 },
        { key: 'location', header: 'Location', width: 22 },
        { key: 'sub_office_code', header: 'Sub Office', width: 14 },
        { key: 'purchase_date', header: 'Purchase Date', width: 14 },
        { key: 'total_amount', header: 'Total Amount', width: 14 },
        { key: 'total_seal', header: 'Total Seal', width: 12 },
        { key: 'added', header: 'Added', width: 10 },
        { key: 'available', header: 'Available', width: 12 },
        { key: 'used', header: 'Used', width: 10 },
        { key: 'damaged', header: 'Damaged', width: 12 },
      ],
      rows: masters.map((m) => ({ ...m, location: m.location ?? '', sub_office_code: m.sub_office_code ?? '' })),
    },
    {
      name: 'Seal Numbers',
      columns: [
        { key: 'id', header: 'ID', width: 8 },
        { key: 'seal_number', header: 'Seal Number', width: 22 },
        { key: 'status', header: 'Status', width: 12 },
        { key: 'location', header: 'Location', width: 22 },
        { key: 'purchase_date', header: 'Purchase Date', width: 14 },
        { key: 'notes', header: 'Notes', width: 40 },
      ],
      rows: numbers.map((nrow) => ({ ...nrow, location: nrow.location ?? '', notes: nrow.notes ?? '' })),
    },
  ]);

  return xlsxResponse(buf, `seals-report-${dateStamp()}.xlsx`);
}
