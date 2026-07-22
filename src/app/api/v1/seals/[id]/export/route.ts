import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealBatch, sealNumber, mainOfficeMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

// GET /api/v1/seals/{id}/export
// Two-sheet workbook: a per-batch details sheet + a sheet listing every
// individual seal under it. Used by finance/audit to archive a batch.

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid id');
  }

  const [batch] = await db
    .select({
      id: sealBatch.id,
      location: mainOfficeMaster.mainLocationName,
      sub_office_code: sealBatch.subOfficeCode,
      purchase_date: sealBatch.purchaseDate,
      total_amount: sealBatch.totalAmount,
      total_seal: sealBatch.totalSeal,
      display: sealBatch.display,
    })
    .from(sealBatch)
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealBatch.officeLocationId))
    .where(eq(sealBatch.id, id))
    .limit(1);
  if (!batch) throw new NotFoundError('Seal batch not found');

  const numbers = await db
    .select({
      seal_number: sealNumber.sealNumber,
      status: sealNumber.status,
      notes: sealNumber.notes,
    })
    .from(sealNumber)
    .where(
      and(
        eq(sealNumber.sealBatchId, id),
        eq(sealNumber.display, 'Y'),
      ),
    )
    .orderBy(asc(sealNumber.id));

  const detail = [
    { field: 'ID', value: batch.id },
    { field: 'Office Location', value: batch.location ?? '' },
    { field: 'Sub Office', value: batch.sub_office_code ?? '' },
    { field: 'Purchase Date', value: batch.purchase_date ?? '' },
    { field: 'Total Amount', value: batch.total_amount ?? '0' },
    { field: 'Total Seal', value: batch.total_seal },
    { field: 'Added Seals', value: numbers.length },
    { field: 'Display', value: batch.display === 'Y' ? 'Yes' : 'No' },
  ];

  const buf = await buildXlsx([
    {
      name: 'Seal Details',
      columns: [
        { key: 'field', header: 'Field', width: 24 },
        { key: 'value', header: 'Value', width: 40 },
      ],
      rows: detail,
    },
    {
      name: 'Seal Numbers',
      columns: [
        { key: 'sno', header: '#', width: 6 },
        { key: 'seal_number', header: 'Seal Number', width: 22 },
        { key: 'status', header: 'Status', width: 14 },
        { key: 'notes', header: 'Notes', width: 40 },
      ],
      rows: numbers.map((n, i) => ({
        sno: i + 1,
        seal_number: n.seal_number,
        status: n.status,
        notes: n.notes ?? '',
      })),
    },
  ]);

  // xlsxResponse builds a plain Response (xlsx.ts stays Next-agnostic);
  // wrap it so withErrorHandler's NextResponse contract holds.
  const body = xlsxResponse(buf, `seal-batch-${batch.id}-${dateStamp()}.xlsx`);
  return new NextResponse(body.body, {
    status: body.status,
    headers: body.headers,
  });
});
