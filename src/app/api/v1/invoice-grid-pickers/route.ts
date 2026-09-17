import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { gridPickers } from '@/db/queries/invoices';

// GET /api/v1/invoice-grid-pickers?kind=import|export&client_id=123
//
// The dropdowns an invoice's items grid renders: the client's quotations, and
// the MCA files still available to invoice.
//
// Scoped to the CLIENT, not to an invoice, which is the whole point: the grid
// now lives inside the transaction page and has to work on /new, where no
// invoice row exists yet. `/{kind}-invoices/{id}/grid` still answers for a
// saved invoice and is unchanged.

const querySchema = z.object({
  kind: z.enum(['import', 'export']),
  client_id: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = querySchema.parse({
    kind: searchParams.get('kind') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
  });

  // No client chosen yet is not an error — it is the state the form opens in,
  // and both lists are correctly empty until one is picked.
  return ok(await gridPickers(q.kind, q.client_id ?? null));
});
