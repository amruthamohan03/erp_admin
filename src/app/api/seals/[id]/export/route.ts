// GET /api/seals/[id]/export → Excel for one seal master: a details sheet + a
// sheet listing its seal numbers.
import { NextRequest } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealNos, sealIndividualNumbers, mainOfficeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const [master] = await db
    .select({
      id: sealNos.id,
      location: mainOfficeMaster.mainLocationName,
      sub_office_code: sealNos.subOfficeCode,
      purchase_date: sealNos.purchaseDate,
      total_amount: sealNos.totalAmount,
      total_seal: sealNos.totalSeal,
      display: sealNos.display,
    })
    .from(sealNos)
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, sealNos.officeLocationId))
    .where(eq(sealNos.id, id));
  if (!master) return fail('Seal not found', 404);

  const numbers = await db
    .select({ seal_number: sealIndividualNumbers.sealNumber, status: sealIndividualNumbers.status, notes: sealIndividualNumbers.notes })
    .from(sealIndividualNumbers)
    .where(and(eq(sealIndividualNumbers.sealMasterId, id), eq(sealIndividualNumbers.display, 'Y')))
    .orderBy(asc(sealIndividualNumbers.id));

  const detail = [
    { field: 'ID', value: master.id },
    { field: 'Office Location', value: master.location ?? '' },
    { field: 'Sub Office', value: master.sub_office_code ?? '' },
    { field: 'Purchase Date', value: master.purchase_date ?? '' },
    { field: 'Total Amount', value: master.total_amount ?? '0' },
    { field: 'Total Seal', value: master.total_seal },
    { field: 'Added Seals', value: numbers.length },
    { field: 'Display', value: master.display === 'Y' ? 'Yes' : 'No' },
  ];

  const buf = await buildXlsx([
    {
      name: 'Seal Details',
      columns: [{ key: 'field', header: 'Field', width: 24 }, { key: 'value', header: 'Value', width: 40 }],
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
      rows: numbers.map((nrow, i) => ({ sno: i + 1, ...nrow, notes: nrow.notes ?? '' })),
    },
  ]);

  return xlsxResponse(buf, `seal-${master.id}-${dateStamp()}.xlsx`);
}
