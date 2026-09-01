import { NextRequest } from 'next/server';
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { licenseT } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/license-mca-refs?client_id=N
//
// The middle step of Import Tracking's Client → MCA Reference → License cascade.
// Returns the distinct MCA references recorded on that client's licences.
//
// Shaped like a master options endpoint (`id` + a label column) so the standard
// metadata select can consume it with no special case in the renderer. The `id`
// IS the reference string: an MCA reference has no surrogate key of its own, and
// imports_t.mca_ref stores the text. Non-numeric values also mean the dropdown
// keeps the order given here rather than being re-sorted by id (§4.16), so the
// ORDER BY below is what the operator sees.

const querySchema = z.object({
  client_id: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = querySchema.parse({ client_id: searchParams.get('client_id') ?? undefined });

  // Without a client the answer is "none", not "every reference in the system" —
  // the field is only reachable after a client is chosen, and returning the lot
  // would let an operator pick a reference belonging to someone else.
  if (!q.client_id) return ok([]);

  const rows = await db
    .selectDistinct({ mca_ref: licenseT.mcaRef })
    .from(licenseT)
    .where(
      and(
        eq(licenseT.clientId, q.client_id),
        eq(licenseT.display, 'Y'),
        isNotNull(licenseT.mcaRef),
        ne(licenseT.mcaRef, ''),
      ),
    )
    .orderBy(sql`1`);

  return ok(rows.map((r) => ({ id: r.mca_ref, mca_ref: r.mca_ref })));
});
