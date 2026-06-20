import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kindMaster, quotationCategoryMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError } from '@/lib/errors';
import { buildQuotation } from '@/lib/quotations/compute';
import { quotationBodySchema } from '@/schemas/quotations';

// POST /api/v1/quotations/preview
// Run buildQuotation against the supplied body WITHOUT persisting.
// The builder UI calls this on every edit (debounced) so it never
// computes totals client-side — keeps the math single-source-of-truth
// in compute.ts and prevents the UI from drifting against the server.
//
// Same body shape as POST /api/v1/quotations. Returns the same shape
// buildQuotation produces: { header, items }.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const body = quotationBodySchema.parse(await req.json());

  let kindName = '';
  if (body.kind_id) {
    const [kind] = await db
      .select({ kindName: kindMaster.kindName })
      .from(kindMaster)
      .where(eq(kindMaster.id, body.kind_id))
      .limit(1);
    if (!kind) throw new BadRequestError('Invalid kind_id');
    kindName = kind.kindName;
  }

  const customsRows = await db
    .select({ id: quotationCategoryMaster.id })
    .from(quotationCategoryMaster)
    .where(eq(quotationCategoryMaster.isCustoms, true));
  const customsByCat = new Map<number, boolean>(
    customsRows.map((r) => [r.id, true]),
  );

  const { header, items } = buildQuotation(body, kindName, customsByCat);
  return ok({ header, items });
});
