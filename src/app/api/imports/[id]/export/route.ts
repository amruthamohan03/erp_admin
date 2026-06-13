// GET /api/imports/[id]/export → CSV download of a single import, FK values
// resolved to master names. Long (field-per-row) layout, matching the clients /
// license single-export. 404 if missing.
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { toCsv, csvResponse, dateStamp } from '@/lib/csv';
import { getImportDetail } from '@/db/queries/imports';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const row = await getImportDetail(id);
  if (!row) return fail('Import not found', 404);

  const longRows = Object.entries(row).map(([field, value]) => ({ field, value }));
  const csv = toCsv(longRows, [
    { key: 'field', header: 'Field' },
    { key: 'value', header: 'Value' },
  ]);

  const safe = (row.mca_ref ?? 'import').replace(/[^A-Za-z0-9_-]/g, '');
  return csvResponse(csv, `import-${safe}-${row.id}-${dateStamp()}.csv`);
}
