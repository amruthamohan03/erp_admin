// POST /api/v1/sydonia/[kind]/update  (kind = import | export)
// Applies the confirmed (valid) rows: matches by MCA ref, writes only non-empty
// milestone columns, never inserts. Returns updated/failed counts + per-row errors.
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { applySydoniaUpdates, type SydoniaKind } from '@/db/queries/sydonia';

const rowSchema = z.object({
  mca_ref: z.string().trim().min(1),
  declaration_reference: z.string().optional().default(''),
  declaration_date: z.string().optional().default(''),
  liquidation_reference: z.string().optional().default(''),
  liquidation_date: z.string().optional().default(''),
  quittance_reference: z.string().optional().default(''),
  quittance_date: z.string().optional().default(''),
  liquidation_amount: z.string().optional().default(''),
});
const bodySchema = z.object({ rows: z.array(rowSchema).min(1).max(5000) });

export const POST = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ kind: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const kind = (await ctx.params).kind;
    if (kind !== 'import' && kind !== 'export') return fail('Invalid kind', 400);

    const body = bodySchema.parse(await req.json());
    const result = await applySydoniaUpdates(kind as SydoniaKind, body.rows, session.uid);
    return ok(result);
  },
);
