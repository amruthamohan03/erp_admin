// GET /api/seal-numbers/check?seal_number= — availability check for a single seal.
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealIndividualNumbers } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const sealNumber = (new URL(req.url).searchParams.get('seal_number') ?? '').trim();
  if (!sealNumber) return fail('seal_number is required', 400);

  const [row] = await db
    .select({ status: sealIndividualNumbers.status })
    .from(sealIndividualNumbers)
    .where(eq(sealIndividualNumbers.sealNumber, sealNumber))
    .limit(1);

  if (!row) return ok({ available: false, found: false, status: null, seal_number: sealNumber });
  return ok({ available: row.status === 'Available', found: true, status: row.status, seal_number: sealNumber });
}
