import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sealNumber } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';

// GET /api/v1/seal-numbers/check?seal_number=N
// Quick availability lookup for a single seal number. Returns:
//   { found: false } — number isn't on file
//   { found: true, status: 'Available'|'Used'|'Damaged', available: bool }
//
// Used by the Tracking UI to validate a seal before applying it (e.g.
// when an operator types or scans a number).

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const value = (
    new URL(req.url).searchParams.get('seal_number') ?? ''
  ).trim();
  if (!value) throw new BadRequestError('seal_number is required');

  const [row] = await db
    .select({ status: sealNumber.status })
    .from(sealNumber)
    .where(eq(sealNumber.sealNumber, value))
    .limit(1);

  if (!row) {
    return ok({
      seal_number: value,
      found: false,
      status: null,
      available: false,
    });
  }
  return ok({
    seal_number: value,
    found: true,
    status: row.status,
    available: row.status === 'Available',
  });
});
