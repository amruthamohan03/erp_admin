// PATCH /api/v1/partielles/[id] — resize an allotment (shrink/grow guarded)
import { type NextRequest } from 'next/server';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { updatePartielle, PartielleError } from '@/db/queries/partielle';
import { partielleUpdateSchema } from '@/schemas/partielle';

export const PATCH = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail('Invalid allotment id', 400);

    const body = partielleUpdateSchema.parse(await req.json());
    try {
      await updatePartielle(id, body, session.uid);
      return ok({ id });
    } catch (e) {
      if (e instanceof PartielleError) return fail(e.message, 400);
      throw e;
    }
  },
);
