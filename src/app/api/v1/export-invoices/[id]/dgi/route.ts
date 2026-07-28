// PATCH /api/v1/export-invoices/[id]/dgi — edit DGI info (DGI code, amount,
// normalized-by). A validated invoice that becomes DGI-complete is promoted to
// DGI-verified, matching the legacy updateDgiInfo.
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { updateExportDgiInfo } from '@/db/queries/exportInvoiceExtras';

const bodySchema = z.object({
  dgi_code: z.string().trim().max(100).nullable().optional(),
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
    const res = await updateExportDgiInfo(
      id,
      {
        dgi_code: body.dgi_code?.trim() ? body.dgi_code.trim() : null,
        dgi_amount: body.dgi_amount,
        normalized_by: body.normalized_by ?? null,
      },
      session.uid,
    );
    if (!res.found) return fail('Invoice not found', 404);
    return ok({ id, verified: res.verified });
  },
);
