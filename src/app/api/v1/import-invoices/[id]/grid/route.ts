// GET  /api/v1/import-invoices/[id]/grid — everything the grid renders
// POST /api/v1/import-invoices/[id]/grid — replace items, update selected MCAs, recompute totals
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { gridData, saveGrid } from '@/db/queries/invoices';
import { gridSaveSchema } from '@/schemas/invoiceGrid';

function parseId(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Invalid invoice id', 400);

    const data = await gridData('import', id);
    if (!data) return fail('Invoice not found', 404);
    return ok(data);
  },
);

export const POST = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Invalid invoice id', 400);

    const data = await gridData('import', id);
    if (!data) return fail('Invoice not found', 404);
    if (data.header.validated >= 1) return fail('Validated invoices cannot be edited', 409);

    const body = gridSaveSchema.parse(await req.json());
    const result = await saveGrid('import', id, body, session.uid);
    return ok(result);
  },
);
