// GET  /api/v1/payments/[id]/mca — the request's references + the client's picker refs
// POST /api/v1/payments/[id]/mca — validate + persist references (sets amount = total)
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { mcaGridData, saveMcaRefs, McaSaveError } from '@/db/queries/paymentMca';
import { mcaSaveSchema } from '@/schemas/paymentMca';

function parseId(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const GET = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Invalid payment id', 400);

    const data = await mcaGridData(id);
    if (!data) return fail('Payment request not found', 404);
    return ok(data);
  },
);

export const POST = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const id = parseId((await ctx.params).id);
    if (!id) return fail('Invalid payment id', 400);

    const body = mcaSaveSchema.parse(await req.json());
    try {
      const result = await saveMcaRefs(id, body.refs, session.uid);
      return ok(result);
    } catch (e) {
      if (e instanceof McaSaveError) return fail(e.message, 400, e.details);
      throw e;
    }
  },
);
