// POST /api/v1/import-invoices/[id]/validate — set validated flag
// (0 not-validated, 1 validated, 2 DGI-verified). Body: { validated: 0|1|2 }.
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { gridData, setValidated } from '@/db/queries/invoices';

const bodySchema = z.object({ validated: z.union([z.literal(0), z.literal(1), z.literal(2)]) });

export const POST = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid invoice id', 400);

    const data = await gridData('import', id);
    if (!data) return fail('Invoice not found', 404);

    const { validated } = bodySchema.parse(await req.json());
    await setValidated('import', id, validated, session.uid);
    return ok({ id, validated });
  },
);
