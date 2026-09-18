import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { gridPickers } from '@/db/queries/invoices';

// GET /api/v1/invoice-grid-pickers?kind=import|export&client_id=123
//                                 [&license_id=45][&invoice_id=67]
//
// The dropdowns an invoice's items grid renders: the client's quotations, and
// the MCA files still available to invoice.
//
// Scoped to the CLIENT, not to an invoice, which is the whole point: the grid
// lives inside the transaction page and has to work on /new, where no invoice
// row exists yet. `license_id` narrows an export invoice to its licence's
// files; `invoice_id` keeps the files an invoice already carries on offer when
// it is reopened — main's getMCAReferences did both.

const querySchema = z.object({
  kind: z.enum(['import', 'export']),
  client_id: z.coerce.number().int().positive().optional(),
  license_id: z.coerce.number().int().positive().optional(),
  invoice_id: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = querySchema.parse({
    kind: searchParams.get('kind') ?? undefined,
    client_id: searchParams.get('client_id') || undefined,
    license_id: searchParams.get('license_id') || undefined,
    invoice_id: searchParams.get('invoice_id') || undefined,
  });

  // No client chosen yet is not an error — it is the state the form opens in,
  // and both lists are correctly empty until one is picked.
  return ok(
    await gridPickers(q.kind, q.client_id ?? null, {
      licenseId: q.license_id ?? null,
      invoiceId: q.invoice_id ?? null,
    }),
  );
});
