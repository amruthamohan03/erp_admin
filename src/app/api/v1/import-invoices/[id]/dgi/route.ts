// PATCH /api/v1/import-invoices/[id]/dgi — edit DGI info (DGI code, amount,
// normalized-by). A validated invoice that becomes DGI-complete is promoted to
// DGI-verified, matching the legacy updateDGIInfo.
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { updateDgiInfo } from '@/db/queries/importInvoiceExtras';

const bodySchema = z.object({
  tally_ref: z.string().trim().max(100).nullable().optional(),
  dgi_amount: z.coerce.number().min(0).default(0),
  normalized_by: z.coerce.number().int().positive().nullable().optional(),
});

export const PATCH = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid invoice id', 400);

    const body = bodySchema.parse(await req.json());
    const res = await updateDgiInfo(
      id,
      {
        tally_ref: body.tally_ref?.trim() ? body.tally_ref.trim() : null,
        dgi_amount: body.dgi_amount,
        normalized_by: body.normalized_by ?? null,
      },
      session.uid,
    );
    if (!res.found) return fail('Invoice not found', 404);
    return ok({ id });
  },
);
