// GET /api/imports/[id] → joined JSON detail for the View popup on the /import
// page. Read-only; mutations go through the §4.12 transactional-page API at
// /api/pages/import/[id].
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
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

  return ok(row);
}
