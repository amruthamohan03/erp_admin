// DELETE /api/v1/export-invoices/[id] — soft delete (display = 'N').
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { gridData, softDeleteInvoice } from '@/db/queries/invoices';

export const DELETE = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid invoice id', 400);

    const data = await gridData('export', id);
    if (!data) return fail('Invoice not found', 404);
    if (data.header.validated >= 1) return fail('Validated invoices cannot be deleted', 409);

    await softDeleteInvoice('export', id, session.uid);
    return ok({ id, deleted: true });
  },
);
