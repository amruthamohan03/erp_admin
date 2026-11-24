// PATCH /api/v1/partielles/[id] — resize an allotment (shrink/grow guarded).
// Shared by Import Tracking's PARTIELLE Allocation and Import License → Bivac.
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { updatePartielle, PartielleError } from '@/db/queries/partielle';
import { partielleUpdateSchema } from '@/schemas/partielle';

export const PATCH = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;
    const raw = (await ctx.params).id;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return fail(`"${raw}" is not a valid PARTIELLE id.`, 400);

    const body = partielleUpdateSchema.parse(await req.json());
    try {
      await db.transaction(async (tx) => {
        const done = await updatePartielle(id, body, session.uid, tx);
        // §4.28 — resizing an allotment is a logged update with a per-field diff.
        await recordAudit(tx, {
          actorId: session.uid,
          action: 'update',
          entityType: 'partielle',
          entityId: id,
          module: 'partielle',
          before: done.before,
          after: { partial_weight: body.partial_weight, partial_fob: body.partial_fob },
          metadata: { partial_name: done.partial_name, license_id: done.license_id },
        });
      });
      return ok({ id });
    } catch (e) {
      if (e instanceof PartielleError) return fail(e.message, 400);
      throw e;
    }
  },
);
