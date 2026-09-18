import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { mcaHeaderPatch } from '@/db/queries/invoices';

// GET /api/v1/invoice-mca-header?kind=import|export&client_id=12&mca_ids=4,9
//
// What the selected MCA files say an invoice's header is — kind, goods and
// transport; for Import also FOB, freight, weight, duty, the truck and the
// customs references — plus the quotation main would auto-select for them.
//
// Read-only. The grid asks this when the set of files changes and hands the
// answer to the form; nothing is stored until the page's single Save (§4.17).

const querySchema = z.object({
  kind: z.enum(['import', 'export']),
  client_id: z.coerce.number().int().positive({ message: 'Choose a client before selecting MCA files.' }),
  mca_ids: z
    .string()
    .max(4000)
    .transform((s) =>
      s
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = querySchema.parse({
    kind: searchParams.get('kind') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    mca_ids: searchParams.get('mca_ids') ?? '',
  });

  return ok(await mcaHeaderPatch(q.kind, q.client_id, q.mca_ids));
});
