// GET /api/exports/[id]/export → Excel (.xlsx) download of a single export, FK
// values resolved to master names. Long (field-per-row) layout. 404 if missing.
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { getExportDetail } from '@/db/queries/exports';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const row = await getExportDetail(id);
  if (!row) return fail('Export not found', 404);

  const longRows = Object.entries(row).map(([field, value]) => ({
    field,
    value: value as unknown,
  }));

  const buf = await buildXlsx([
    {
      name: 'Export Details',
      columns: [
        { key: 'field', header: 'Field', width: 32 },
        { key: 'value', header: 'Value', width: 60 },
      ],
      rows: longRows,
    },
  ]);

  const safe = (row.mca_ref ?? 'export').replace(/[^A-Za-z0-9_-]/g, '');
  return xlsxResponse(buf, `export-${safe}-${row.id}-${dateStamp()}.xlsx`);
}
