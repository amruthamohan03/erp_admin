// POST /api/v1/import-invoices/pending/[mcaId] — hold a pending import file back
// from invoicing (a reason is required) or release it. Body: { disabled, remark }.
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { pendingFileToggleSchema } from '@/schemas/invoicePending';
import { setPendingFileDisabled } from '@/db/queries/invoicePending';

export const POST = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ mcaId: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const id = Number((await ctx.params).mcaId);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid import file id', 400);

    const body = pendingFileToggleSchema.parse(await req.json());
    const res = await setPendingFileDisabled('import', id, body.disabled, body.remark ?? null, session.uid);
    if (!res.found) return fail('This import file is no longer pending — it has been invoiced or is not cleared.', 404);
    return ok({ id, mca_ref: res.mca_ref, disabled: body.disabled });
  },
);
