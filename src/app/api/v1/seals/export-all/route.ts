import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealBatch, sealNumber, mainOfficeMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/seals/export-all
// Multi-sheet workbook with the full Seals subsystem state:
//   1. Summary   — totals
//   2. By Location — per-office aggregates
//   3. Seal Batches — every batch with derived counts
//   4. Seal Numbers — every individual seal
//
// Counts are computed via correlated sub-selects so the workbook reflects
// the live aggregate without trusting cached columns.

interface CountAggregates {
  added: number;
  available: number;
  used: number;
  damaged: number;
}

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const counts = (status: string | null) =>
    sql<number>`cast((
      SELECT count(*) FROM seal_number_t sn
      WHERE sn.seal_batch_id = ${sealBatch.id}
        AND sn.display = 'Y'
        ${status ? sql`AND sn.status = ${status}` : sql``}
    ) AS int)`;

  const batches = await db
    .select({
      id: sealBatch.id,
      location: mainOfficeMaster.mainLocationName,
      sub_office_code: sealBatch.subOfficeCode,
      purchase_date: sealBatch.purchaseDate,
      total_amount: sealBatch.totalAmount,
      total_seal: sealBatch.totalSeal,
      added: counts(null),
      available: counts('Available'),
      used: counts('Used'),
      damaged: counts('Damaged'),
    })
    .from(sealBatch)
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealBatch.officeLocationId))
    .where(eq(sealBatch.display, 'Y'))
    .orderBy(asc(mainOfficeMaster.mainLocationName), desc(sealBatch.purchaseDate));

  const numbers = await db
    .select({
      id: sealNumber.id,
      seal_number: sealNumber.sealNumber,
      status: sealNumber.status,
      location: mainOfficeMaster.mainLocationName,
      purchase_date: sealBatch.purchaseDate,
      notes: sealNumber.notes,
    })
    .from(sealNumber)
    .innerJoin(sealBatch, eq(sealBatch.id, sealNumber.sealBatchId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealBatch.officeLocationId))
    .where(
      and(
        eq(sealNumber.display, 'Y'),
        eq(sealBatch.display, 'Y'),
      ),
    )
    .orderBy(asc(mainOfficeMaster.mainLocationName), asc(sealNumber.id));

  const totalSeal = batches.reduce((acc, b) => acc + (b.total_seal ?? 0), 0);
  const added = batches.reduce((acc, b) => acc + b.added, 0);
  const available = batches.reduce((acc, b) => acc + b.available, 0);
  const used = batches.reduce((acc, b) => acc + b.used, 0);
  const damaged = batches.reduce((acc, b) => acc + b.damaged, 0);

  const byLoc = new Map<
    string,
    { location: string; purchases: number } & CountAggregates
  >();
  for (const b of batches) {
    const key = b.location ?? 'No Location';
    const e =
      byLoc.get(key) ??
      ({
        location: key,
        purchases: 0,
        added: 0,
        available: 0,
        used: 0,
        damaged: 0,
      } as { location: string; purchases: number } & CountAggregates);
    e.purchases += 1;
    e.added += b.added;
    e.available += b.available;
    e.used += b.used;
    e.damaged += b.damaged;
    byLoc.set(key, e);
  }

  const buf = await buildXlsx([
    {
      name: 'Summary',
      columns: [
        { key: 'metric', header: 'Metric', width: 24 },
        { key: 'value', header: 'Value', width: 18 },
      ],
      rows: [
        { metric: 'Locations', value: byLoc.size },
        { metric: 'Purchases', value: batches.length },
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
        { key: 'location', header: 'Location', width: 28 },
        { key: 'purchases', header: 'Purchases', width: 12 },
        { key: 'added', header: 'Added', width: 12 },
        { key: 'available', header: 'Available', width: 12 },
        { key: 'used', header: 'Used', width: 12 },
        { key: 'damaged', header: 'Damaged', width: 12 },
      ],
      rows: Array.from(byLoc.values()) as unknown as Array<Record<string, unknown>>,
    },
    {
      name: 'Seal Batches',
      columns: [
        { key: 'id', header: 'ID', width: 8 },
        { key: 'location', header: 'Location', width: 28 },
        { key: 'sub_office_code', header: 'Sub Office', width: 16 },
        { key: 'purchase_date', header: 'Purchase Date', width: 14 },
        { key: 'total_amount', header: 'Total Amount', width: 14 },
        { key: 'total_seal', header: 'Total Seal', width: 12 },
        { key: 'added', header: 'Added', width: 10 },
        { key: 'available', header: 'Available', width: 12 },
        { key: 'used', header: 'Used', width: 10 },
        { key: 'damaged', header: 'Damaged', width: 12 },
      ],
      rows: batches.map((b) => ({
        ...b,
        location: b.location ?? '',
        sub_office_code: b.sub_office_code ?? '',
        purchase_date: b.purchase_date ?? '',
      })),
    },
    {
      name: 'Seal Numbers',
      columns: [
        { key: 'sno', header: '#', width: 6 },
        { key: 'seal_number', header: 'Seal Number', width: 22 },
        { key: 'status', header: 'Status', width: 14 },
        { key: 'location', header: 'Location', width: 28 },
        { key: 'purchase_date', header: 'Purchase Date', width: 14 },
        { key: 'notes', header: 'Notes', width: 40 },
      ],
      rows: numbers.map((n, i) => ({
        sno: i + 1,
        seal_number: n.seal_number,
        status: n.status,
        location: n.location ?? '',
        purchase_date: n.purchase_date ?? '',
        notes: n.notes ?? '',
      })),
    },
  ]);

  // xlsxResponse returns a plain Response — wrap for withErrorHandler's
  // NextResponse contract.
  const body = xlsxResponse(buf, `seals-all-${dateStamp()}.xlsx`);
  return new NextResponse(body.body, {
    status: body.status,
    headers: body.headers,
  });
});
