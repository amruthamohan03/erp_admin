// GET /api/licenses/[id] → joined JSON detail for the View popup on the /license
// page. Read-only; mutations go through the §4.12 transactional-page API at
// /api/pages/license/[id].
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
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

  return ok(row);
}
