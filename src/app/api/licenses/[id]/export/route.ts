// GET /api/licenses/[id]/export → CSV download of a single license, FK values
// resolved to master names. Long (field-per-row) layout — easier to read in
// Excel than one wide row, matching the clients single-export. 404 if missing.
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { toCsv, csvResponse, dateStamp } from '@/lib/csv';
import { getLicenseDetail } from '@/db/queries/licenses';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return fail('Invalid id', 400);

  const row = await getLicenseDetail(id);
  if (!row) return fail('License not found', 404);

  const longRows = Object.entries(row).map(([field, value]) => ({ field, value }));
  const csv = toCsv(longRows, [
    { key: 'field', header: 'Field' },
    { key: 'value', header: 'Value' },
  ]);

  const safe = (row.license_number ?? 'license').replace(/[^A-Za-z0-9_-]/g, '');
  return csvResponse(csv, `license-${safe}-${row.id}-${dateStamp()}.csv`);
}
